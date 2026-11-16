import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/** Replace a file atomically and preserve its existing permission bits. */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: { defaultMode?: number; beforeCommit?: () => Promise<void> } = {},
): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.ocean-tmp`;
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
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
