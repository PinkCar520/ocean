import { createHash } from 'node:crypto';

export function notebookDigest(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Read snapshots are scoped to the active conversation and real workspace path. */
export class NotebookSnapshots {
  private sessions = new Map<string, Map<string, string>>();
  private locks = new Map<string, Promise<void>>();

  get(sessionId: string, path: string): string | undefined { return this.sessions.get(sessionId)?.get(path); }
  set(sessionId: string, path: string, digest: string): void {
    let entries = this.sessions.get(sessionId);
    if (!entries) this.sessions.set(sessionId, entries = new Map());
    entries.set(path, digest);
  }

  async withLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(path) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.locks.set(path, current);
    await previous;
    try { return await operation(); } finally {
      release();
      if (this.locks.get(path) === current) this.locks.delete(path);
    }
  }
}
