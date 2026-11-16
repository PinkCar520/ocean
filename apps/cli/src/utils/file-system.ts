import * as fs from 'node:fs/promises';
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
    await fs.writeFile(
      temporaryPath,
      content,
      mode === undefined
        ? { encoding: 'utf-8', mode: options.defaultMode ?? 0o666 }
        : { encoding: 'utf-8', mode },
    );
    await options.beforeCommit?.();
    if (await snapshot() !== original) throw new Error('Atomic write conflict: target changed before commit');
    if (original === null) {
      // link is an atomic no-clobber install for creation.
      try { await fs.link(temporaryPath, filePath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Atomic write conflict: target was created'); throw error; }
      await fs.unlink(temporaryPath);
    } else await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Kernel advisory lock: released on pipe closure or process death, never unlink the lock inode. */
export async function withProcessFileLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  const { spawn } = await import('node:child_process');
  const child = spawn('python3', ['-u', '-c', `import os,sys,fcntl,stat
fd=os.open(sys.argv[1],os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
if not stat.S_ISREG(os.fstat(fd).st_mode): raise RuntimeError('Unsafe lock file')
fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
print('locked',flush=True)
sys.stdin.buffer.read()
`, file], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Checkpoint conflict: workspace lock unavailable')));
      child.stdout.once('data', () => resolve());
    });
    return await action();
  } finally {
    if (child.exitCode === null && child.pid) await new Promise<void>((resolve) => { child.once('close', () => resolve()); child.stdin.end(); });
  }
}
