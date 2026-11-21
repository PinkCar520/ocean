import * as fs from 'node:fs/promises';
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
    let stat;
    try { stat = await fs.lstat(file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_EVENTS_BYTES)
      throw new Error('Unsafe runtime event file');
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Malformed runtime event stream');
    replayRuntime(runId, parsed as RuntimeEvent[]);
    return parsed as RuntimeEvent[];
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
