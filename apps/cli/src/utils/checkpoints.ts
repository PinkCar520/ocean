import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { SecurityEngine } from './security.js';
import { atomicWriteFile, withProcessFileLock } from './file-system.js';
import { NotebookSnapshots } from './notebook-snapshots.js';
import type { ToolContext } from '../types.js';
const locks = new NotebookSnapshots();
const digest = (value: string | null) => value === null ? null : createHash('sha256').update(value).digest('hex');
interface Entry { path: string; before: string | null; beforeHash?: string | null; after: string | null; mode?: number }
interface Checkpoint { version: 1; id: string; sessionId: string; userId: string; runId?: string; toolCallId?: string; status: 'prepared' | 'applied' | 'rolling_back' | 'rolled_back'; files: Entry[] }

/** Local journals reuse atomic file persistence; interrupted changes are inspected, never replayed. */
export class Checkpoints {
  constructor(private readonly context: ToolContext) {}
  private async coordinated<T>(action: () => Promise<T>): Promise<T> {
    return locks.withLock(await fs.realpath(this.context.cwd), async () => {
      await this.directory();
      const root = await fs.realpath(this.context.cwd);
      return withProcessFileLock(path.join(root, '.ocean', 'checkpoints', '.workspace.lock'), action);
    });
  }
  private async directory(): Promise<string> {
    const root = await fs.realpath(this.context.cwd);
    const scope = createHash('sha256').update(JSON.stringify([this.context.userId, this.context.sessionId])).digest('hex');
    let dir = root;
    for (const part of ['.ocean', 'checkpoints', scope]) {
      dir = path.join(dir, part);
      try { await fs.mkdir(dir, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const info = await fs.lstat(dir);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe checkpoint directory');
    }
    return dir;
  }
  private async target(value: string): Promise<string> {
    const lexical = path.resolve(this.context.cwd, value);
    const file = await new SecurityEngine(this.context.cwd).resolveWorkspacePath(value);
    const root = await fs.realpath(this.context.cwd);
    if (file === root || file.startsWith(path.join(root, '.ocean') + path.sep) || file.startsWith(path.join(root, '.git') + path.sep)) throw new Error('Checkpoint target is protected');
    let ancestor = lexical;
    const lexicalRoot = path.resolve(this.context.cwd);
    while (ancestor !== lexicalRoot && ancestor !== path.dirname(ancestor)) {
      try { if ((await fs.lstat(ancestor)).isSymbolicLink()) throw new Error('Checkpoint target contains a symlink'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      ancestor = path.dirname(ancestor);
    }
    return file;
  }
  private async content(file: string): Promise<{ text: string | null; mode?: number }> {
    try {
      const info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw new Error('Checkpoint requires a regular text file up to 2 MB');
      const bytes = await fs.readFile(file);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) throw new Error('Binary checkpoints are unsupported');
      return { text, mode: info.mode & 0o777 };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: null }; throw error; }
  }
  private async save(record: Checkpoint): Promise<void> {
    const serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized) > 24 * 1024 * 1024) throw new Error('Checkpoint exceeds 24 MB limit');
    await atomicWriteFile(path.join(await this.directory(), `${record.id}.json`), serialized, { defaultMode: 0o600 });
  }
  async get(id: string): Promise<Checkpoint> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid checkpoint id');
    const file = path.join(await this.directory(), `${id}.json`);
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 24 * 1024 * 1024) throw new Error('Unsafe checkpoint file');
    const record = JSON.parse(await fs.readFile(file, 'utf8')) as Checkpoint;
    if (record.version !== 1 || record.id !== id || record.sessionId !== this.context.sessionId || record.userId !== this.context.userId || !Array.isArray(record.files) || !record.files.length || record.files.length > 20 || !['prepared', 'applied', 'rolling_back', 'rolled_back'].includes(record.status)) throw new Error('Invalid checkpoint');
    const seen = new Set<string>();
    for (const entry of record.files) {
      const resolved = await this.target(entry.path);
      if ((entry.after !== null && !/^[a-f0-9]{64}$/.test(entry.after)) || seen.has(resolved) || !(entry.before === null || typeof entry.before === 'string') || !(entry.after === null || typeof entry.after === 'string') || (entry.mode !== undefined && (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777))) throw new Error('Invalid checkpoint entry');
      seen.add(resolved);
    }
    return record;
  }
  async list(): Promise<Checkpoint[]> {
    const entries = await fs.readdir(await this.directory());
    return Promise.all(entries.filter((name) => name.endsWith('.json')).map((name) => this.get(name.slice(0, -5))));
  }
  async diff(id: string) {
    const record = await this.get(id);
    return Promise.all(record.files.map(async (entry) => ({ path: entry.path, action: entry.before === null ? 'create' : entry.after === null ? 'delete' : 'modify', before: entry.before, afterDigest: entry.after, current: (await this.content(await this.target(entry.path))).text })));
  }
  async change(changes: Array<{ path: string; content: string | null; expectedBefore?: string }>): Promise<string> {
    return this.coordinated(async () => {
      this.context.signal?.throwIfAborted();
      if (!changes.length || changes.length > 20) throw new Error('Checkpoint requires 1–20 files');
      const files: Entry[] = [];
      const seen = new Set<string>();
      for (const change of changes) {
        if (change.content !== null && Buffer.byteLength(change.content) > 2 * 1024 * 1024) throw new Error('Checkpoint file too large');
        const file = await this.target(change.path);
        if (seen.has(file)) throw new Error('Duplicate checkpoint file');
        seen.add(file);
        const before = await this.content(file);
        if (change.expectedBefore !== undefined && before.text !== change.expectedBefore) throw new Error('Checkpoint conflict: file changed since read');
        files.push({ path: file, before: before.text, beforeHash: digest(before.text), after: digest(change.content), mode: before.mode });
      }
      const record: Checkpoint = { version: 1, id: randomUUID(), sessionId: this.context.sessionId, userId: this.context.userId, runId: this.context.runId, toolCallId: this.context.toolCallId, status: 'prepared', files };
      await this.save(record); // Failure here prevents every controlled mutation.
      for (let i = 0; i < files.length; i++) {
        this.context.signal?.throwIfAborted();
        const file = await this.target(files[i].path);
        if (digest((await this.content(file)).text) !== digest(files[i].before)) throw new Error('Checkpoint conflict before write');
        await this.write(file, changes[i].content, files[i].mode, digest(files[i].before));
      }
      record.status = 'applied';
      await this.save(record);
      return record.id;
    });
  }
  private async write(file: string, text: string | null, mode?: number, expected?: string | null): Promise<void> {
    this.context.signal?.throwIfAborted();
    if (text === null) {
      if (await this.target(file) !== file || (expected !== undefined && digest((await this.content(file)).text) !== expected)) throw new Error('Checkpoint conflict before deletion');
      await fs.unlink(file); return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await atomicWriteFile(file, text, { defaultMode: mode ?? 0o666, beforeCommit: async () => {
      this.context.signal?.throwIfAborted();
      if (await this.target(file) !== file || (expected !== undefined && digest((await this.content(file)).text) !== expected)) throw new Error(`Checkpoint conflict: ${file}`);
    } });
  }
  async rollback(id: string): Promise<void> {
    await this.coordinated(async () => {
      const record = await this.get(id);
      if (record.status === 'rolled_back') return;
      // Preflight the entire set before touching any target, including interrupted journals.
      const states = await Promise.all(record.files.map(async (entry) => {
        const current = digest((await this.content(await this.target(entry.path))).text);
        const before = digest(entry.before);
        if (current !== entry.after && !(record.status !== 'applied' && current === before)) throw new Error(`Checkpoint conflict: ${entry.path}`);
        return current === before;
      }));
      record.status = 'rolling_back';
      await this.save(record);
      for (let i = 0; i < record.files.length; i++) {
        this.context.signal?.throwIfAborted();
        if (states[i]) continue;
        const entry = record.files[i];
        const file = await this.target(entry.path);
        if (digest((await this.content(file)).text) !== entry.after) throw new Error(`Checkpoint conflict: ${entry.path}`);
        await this.write(file, entry.before, entry.mode, entry.after);
      }
      record.status = 'rolled_back';
      await this.save(record);
    });
  }
}
