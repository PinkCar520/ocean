import * as fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { replayRuntime, type RuntimeEvent, type RuntimeEventStore } from '@ocean/core';
import { atomicWriteFile } from './file-system.js';

const MAX_EVENTS_BYTES = 16 * 1024 * 1024;
/** Local host persistence adapter. Never stores events in a UI component. */
export class FileRuntimeEventStore implements RuntimeEventStore {
  constructor(private readonly rootDir: string) {}

  private file(runId: string): string {
    if (!runId || runId.length > 256) throw new Error('Invalid runtime run identity');
    const digest = createHash('sha256').update(runId).digest('hex');
    return path.join(this.rootDir, `runtime-${digest}.json`);
  }

  async read(runId: string): Promise<readonly RuntimeEvent[]> {
    const file = this.file(runId);
    // Open once with O_NOFOLLOW and read through the same descriptor. A
    // lstat(path) followed by readFile(path) can be redirected to a symlink
    // between those two operations by another process.
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      if (code === 'ELOOP') throw new Error('Unsafe runtime event file');
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_EVENTS_BYTES)
        throw new Error('Unsafe runtime event file');
      const parsed: unknown = JSON.parse(await handle.readFile('utf8'));
      if (!Array.isArray(parsed)) throw new Error('Malformed runtime event stream');
      replayRuntime(runId, parsed as RuntimeEvent[]);
      return parsed as RuntimeEvent[];
    } finally {
      await handle.close();
    }
  }

  async append(runId: string, expectedRevision: number, events: readonly RuntimeEvent[]): Promise<number> {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const file = this.file(runId);
    const lockFile = `${file}.lock`;
    // Fail closed rather than racing another process or breaking a possibly live lock.
    const lock = await fs.open(lockFile, 'wx', 0o600);
    try {
      const existing = await this.read(runId);
      if (existing.length !== expectedRevision) throw new Error('Runtime revision conflict');
      if (!events.length) return existing.length;
      const next = [...existing, ...events];
      replayRuntime(runId, next);
      const content = JSON.stringify(next);
      if (Buffer.byteLength(content) > MAX_EVENTS_BYTES) throw new Error('Runtime event stream exceeds storage limit');
      await atomicWriteFile(file, content, { defaultMode: 0o600 });
      return next.length;
    } finally {
      await lock.close();
      await fs.unlink(lockFile);
    }
  }
}
