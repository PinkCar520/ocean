import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/** Replace a file atomically and preserve its existing permission bits. */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: { defaultMode?: number; beforeCommit?: () => Promise<void> } = {},
): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.ocean-tmp`;
  const snapshot = async () => {
    try {
      const info = await fs.lstat(filePath);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe atomic write target');
      return `${info.dev}:${info.ino}:${info.mtimeMs}:${createHash('sha256').update(await fs.readFile(filePath)).digest('hex')}`;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  };
  const original = await snapshot();
  let mode: number | undefined;
  try {
    mode = (await fs.stat(filePath)).mode & 0o777;
  } catch {
    // New file; let the process umask choose the default mode.
  }
  try {
    const handle = await fs.open(temporaryPath, 'wx', mode ?? options.defaultMode ?? 0o666);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await options.beforeCommit?.();
    if (await snapshot() !== original) throw new Error('Atomic write conflict: target changed before commit');
    if (original === null) {
      // link is an atomic no-clobber install for creation.
      try { await fs.link(temporaryPath, filePath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Atomic write conflict: target was created'); throw error; }
      await fs.unlink(temporaryPath);
    } else await fs.rename(temporaryPath, filePath);
    // Persist the directory entry as well; a rename without a directory fsync
    // may vanish on abrupt power loss.
    try {
      const directory = await fs.open(path.dirname(filePath), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } catch { /* some platforms/filesystems reject directory fsync */ }
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Cross-process lock directory with owner metadata and stale-lock recovery. */
export async function withProcessFileLock<T>(
  file: string,
  action: () => Promise<T>,
  options: { timeoutMs?: number; staleMs?: number } = {},
): Promise<T> {
  const lockDir = `${file}.lock`;
  const ownerFile = path.join(lockDir, 'owner.json');
  const timeoutMs = options.timeoutMs ?? 30_000;
  const staleMs = options.staleMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  const owner = { pid: process.pid, createdAt: new Date().toISOString() };

  const pidAlive = (pid: number): boolean => {
    try { process.kill(pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
  };

  const steal = async (): Promise<void> => {
    try {
      const info = JSON.parse(await fs.readFile(ownerFile, 'utf8')) as { pid?: number; createdAt?: string };
      const createdAt = info.createdAt ? Date.parse(info.createdAt) : NaN;
      const stale = !Number.isSafeInteger(info.pid) || !pidAlive(info.pid!)
        || (Number.isFinite(createdAt) && Date.now() - createdAt > staleMs);
      if (!stale) return;
      const trash = `${lockDir}.stale-${process.pid}-${Math.random().toString(36).slice(2)}`;
      await fs.rename(lockDir, trash);
      await fs.rm(trash, { recursive: true, force: true });
    } catch {
      // A crashed creator may leave an empty lock directory. Reclaim only when
      // it is old enough that no live process can still be initializing it.
      try {
        const info = await fs.stat(lockDir);
        if (Date.now() - info.mtimeMs > staleMs) {
          const trash = `${lockDir}.stale-${process.pid}-${Math.random().toString(36).slice(2)}`;
          await fs.rename(lockDir, trash);
          await fs.rm(trash, { recursive: true, force: true });
        }
      } catch {
        // Another process may have released/replaced it; the caller retries.
      }
    }
  };

  while (true) {
    try {
      await fs.mkdir(lockDir, { mode: 0o700 });
      await fs.writeFile(ownerFile, JSON.stringify(owner), { mode: 0o600 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await steal();
      if (Date.now() > deadline) throw new Error('Checkpoint conflict: workspace lock unavailable');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    return await action();
  } finally {
    await fs.rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
