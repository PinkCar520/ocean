import type { Compaction, TokenUsageSnapshot } from '../llm/compaction.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { atomicWriteFile } from './file-system.js';
import type { TaskPlanSnapshot } from './task-manager.js';

const SESSION_VERSION = 1;
const MAX_SESSION_BYTES = 20 * 1024 * 1024;

export interface StoredSession {
  version: 1;
  revision?: number;
  id: string;
  workspace: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ModelMessage[];
  subagent?: { ownerPid?: number; updatedAt?: string; parentSessionId: string; toolCallId: string; agent: string; inputDigest: string; status: 'prepared' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'; result?: unknown; error?: string };
  plan?: TaskPlanSnapshot;
  compaction?: Compaction;
  /** Provider-reported context size for the saved transcript. */
  usage?: TokenUsageSnapshot;
  worktree?: { path: string; branch: string; runId?: string };
}

export class SessionStore {
  private readonly journalRetentionMs: number;
  /** Empty sessions built in memory and not yet written to disk. */
  private readonly drafts = new Map<string, StoredSession>();
  constructor(private readonly rootDir = path.join(os.homedir(), '.ocean', 'sessions'), options: { journalRetentionMs?: number } = {}) {
    this.journalRetentionMs = options.journalRetentionMs ?? Number(process.env.OCEAN_TOOL_JOURNAL_RETENTION_MS ?? 7 * 86400000);
    if (!Number.isSafeInteger(this.journalRetentionMs) || this.journalRetentionMs < 0) throw new Error('Invalid journal retention');
  }

  async executeToolCall(id: string, workspace: string, toolCallId: string, toolName: string, input: unknown, execute: () => Promise<any>): Promise<any> {
    await this.load(id, workspace);
    if (!toolCallId) throw new Error('Persistent tool execution requires a toolCallId');
    const inputDigest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const key = createHash('sha256').update(JSON.stringify([id, toolCallId])).digest('hex');
    const file = path.join(this.rootDir, `journal-${key}.json`);
    const record: any = {
      version: 1,
      sessionId: id,
      workspace: path.resolve(workspace),
      toolCallId,
      toolName,
      inputDigest,
      input: safeJournalInput(input),
      createdAt: new Date().toISOString(),
      state: 'prepared',
    };
    // Exclusive creation is the cross-process claim; an interrupted claim is never replayed.
    let handle;
    try { handle = await fs.open(file, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SESSION_BYTES) throw new Error('Unsafe tool journal');
      const previous = JSON.parse(await fs.readFile(file, 'utf8'));
      if (previous.sessionId !== id || previous.toolCallId !== toolCallId || previous.toolName !== toolName || previous.inputDigest !== inputDigest) throw new Error('Tool journal identity mismatch');
      if (previous.state === 'succeeded' || previous.state === 'failed') return previous.output;
      throw new Error('Tool execution outcome unknown; automatic replay is prohibited');
    }
    try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); }
    const save = () => atomicWriteFile(file, JSON.stringify(record), { defaultMode: 0o600 });
    record.state = 'executing'; await save();
    let output;
    try { output = await execute(); }
    catch (error) { record.state = 'unknown'; record.error = String(error); await save(); throw error; }
    record.state = output?.error ? 'failed' : 'succeeded'; record.output = output;
    await save();
    return output;
  }

  /** Query-only reconciliation: adapters must verify the external outcome, never re-execute. */
  async reconcileToolCall(id: string, workspace: string, toolCallId: string,
    query: (identity: { sessionId: string; toolCallId: string; toolName: string; inputDigest: string }) => Promise<{ sessionId: string; toolCallId: string; toolName: string; inputDigest: string; state: 'unknown' | 'succeeded' | 'failed'; output?: unknown }>): Promise<boolean> {
    await this.load(id, workspace);
    const key = createHash('sha256').update(JSON.stringify([id, toolCallId])).digest('hex');
    const file = path.join(this.rootDir, `journal-${key}.json`);
    const lock = `${file}.reconcile-lock`;
    await fs.mkdir(lock, { mode: 0o700 });
    try {
      const info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SESSION_BYTES) throw new Error('Unsafe tool journal');
      const record = JSON.parse(await fs.readFile(file, 'utf8'));
      if (record.sessionId !== id || record.toolCallId !== toolCallId || record.workspace !== path.resolve(workspace)) throw new Error('Tool journal identity mismatch');
      if (record.state !== 'unknown') return false;
      const identity = { sessionId: id, toolCallId, toolName: record.toolName as string, inputDigest: record.inputDigest as string };
      const result = await query(Object.freeze(identity));
      if (Object.entries(identity).some(([key, value]) => result[key as keyof typeof identity] !== value)) throw new Error('Reconciliation identity mismatch');
      if (result.state === 'unknown') return false;
      if (!['succeeded', 'failed'].includes(result.state) || !Object.hasOwn(result, 'output')) throw new Error('Invalid reconciliation result');
      await atomicWriteFile(file, JSON.stringify({ ...record, state: result.state, output: result.output, reconciledAt: new Date().toISOString() }), { defaultMode: 0o600 });
      return true;
    } finally { await fs.rmdir(lock); }
  }

  /**
   * Rebuild the transcript from a completed tool journal when the process died
   * after the side effect but before the turn snapshot was saved. Both successful and\n   * failed terminal outcomes are durable. Unknown or
   * still-executing journals are never turned into a result.
   */
  private async recoverCompletedToolCalls(session: StoredSession): Promise<void> {
    await this.ensureDirectory();
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const journals: any[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('journal-') || !entry.name.endsWith('.json')) continue;
      try {
        const file = path.join(this.rootDir, entry.name);
        const info = await fs.lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SESSION_BYTES) continue;
        const value = JSON.parse(await fs.readFile(file, 'utf8'));
        if (value?.sessionId === session.id && value?.workspace === session.workspace
          && (value?.state === 'succeeded' || value?.state === 'failed') && typeof value.toolCallId === 'string'
          && typeof value.toolName === 'string' && value.input !== undefined
          && typeof value.inputDigest === 'string' && Object.hasOwn(value, 'output')
          && entry.name === `journal-${createHash('sha256').update(JSON.stringify([session.id, value.toolCallId])).digest('hex')}.json`) journals.push(value);
      } catch {
        // Corrupt journals are ignored; they cannot prove an outcome.
      }
    }
    journals.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
    for (const journal of journals) {
      let hasCall = false;
      let hasResult = false;
      for (const message of session.messages) {
        if (!Array.isArray(message.content)) continue;
        for (const part of message.content) {
          if (part.type === 'tool-call' && part.toolCallId === journal.toolCallId) hasCall = true;
          if (part.type === 'tool-result' && part.toolCallId === journal.toolCallId) hasResult = true;
        }
      }
      if (!hasCall) {
        session.messages.push({
          role: 'assistant',
          content: [{ type: 'tool-call', toolCallId: journal.toolCallId, toolName: journal.toolName, input: journal.input }],
        } as ModelMessage);
      }
      if (!hasResult) {
        session.messages.push({
          role: 'tool',
          content: [{ type: 'tool-result', toolCallId: journal.toolCallId, toolName: journal.toolName, output: journal.output }],
        } as ModelMessage);
      }
    }
  }

  /** Remove terminal journal entries after the retention window; unknown entries stay. */
  async pruneJournal(maxAgeMs = this.journalRetentionMs): Promise<number> {
    if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) throw new Error('Invalid journal retention');
    await this.ensureDirectory();
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const entry of await fs.readdir(this.rootDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('journal-') || !entry.name.endsWith('.json')) continue;
      try {
        const file = path.join(this.rootDir, entry.name);
        const value = JSON.parse(await fs.readFile(file, 'utf8'));
        if (value?.state === 'succeeded' || value?.state === 'failed') {
          const info = await fs.lstat(file);
          if (info.mtimeMs < cutoff) { await fs.unlink(file); removed += 1; }
        }
      } catch { /* ignore corrupt or concurrently removed journals */ }
    }
    return removed;
  }

  async list(workspace: string): Promise<StoredSession[]> {
    await this.ensureDirectory();
    const resolvedWorkspace = path.resolve(workspace);
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const sessions: StoredSession[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const session = await this.readFile(path.join(this.rootDir, entry.name));
        if (session.workspace === resolvedWorkspace) sessions.push(session);
      } catch {
        // Ignore corrupt/unreadable session files and keep other sessions available.
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async latestOrCreate(workspace: string): Promise<StoredSession> {
    await this.pruneJournal().catch(() => undefined);
    const latest = (await this.list(workspace))[0];
    return latest ?? this.createDraft(workspace);
  }

  async create(workspace: string, title = 'New session', id: string = randomUUID()): Promise<StoredSession> {
    await this.ensureDirectory();
    const session = this.createDraft(workspace, title, id);
    await this.write(session);
    return session;
  }

  /** Build an in-memory session; nothing is written until the first save(). */
  createDraft(workspace: string, title = 'New session', id: string = randomUUID()): StoredSession {
    const now = new Date().toISOString();
    const session: StoredSession = {
      version: SESSION_VERSION,
      id,
      workspace: path.resolve(workspace),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.drafts.set(id, session);
    return session;
  }

  async fork(id: string, workspace: string): Promise<StoredSession> {
    const original = await this.load(id, workspace);
    const now = new Date().toISOString();
    const fork: StoredSession = {
      version: SESSION_VERSION,
      id: randomUUID(),
      workspace: original.workspace,
      title: original.title,
      createdAt: now,
      updatedAt: now,
      messages: original.messages,
      compaction: original.compaction,
      usage: original.usage,
    };
    await this.write(fork);
    return fork;
  }

  async load(id: string, workspace: string): Promise<StoredSession> {
    const draft = this.drafts.get(id);
    if (draft) {
      if (draft.workspace !== path.resolve(workspace)) throw new Error('Session belongs to a different workspace.');
      return draft;
    }
    const session = await this.readFile(this.filePath(id));
    if (session.workspace !== path.resolve(workspace)) {
      throw new Error('Session belongs to a different workspace.');
    }
    if (session.subagent?.status === 'running') {
      let stale = false;
      if (session.subagent.ownerPid) {
        try { process.kill(session.subagent.ownerPid, 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') stale = true; }
      }
      const heartbeat = session.subagent.updatedAt ? Date.parse(session.subagent.updatedAt) : NaN;
      // A live PID may belong to a reused process; require a recent heartbeat.
      if (Number.isFinite(heartbeat) && Date.now() - heartbeat > 30_000) stale = true;
      if (stale) session.subagent.status = 'unknown';
    }
    await this.recoverCompletedToolCalls(session);
    return session;
  }

  async save(id: string, workspace: string, messages: ModelMessage[]): Promise<StoredSession> {
    const session = await this.load(id, workspace);
    validateTranscript(messages);
    const serialized = JSON.stringify(messages);
    if (Buffer.byteLength(serialized, 'utf-8') > MAX_SESSION_BYTES) {
      throw new Error(`Session exceeds the ${MAX_SESSION_BYTES / 1024 / 1024} MB local storage limit.`);
    }
    session.messages = messages;
    if (session.usage && session.usage.messageCount > messages.length) session.usage = undefined;
    session.updatedAt = new Date().toISOString();
    if (session.title === 'New session') session.title = firstUserText(messages) || session.title;
    // An untouched empty draft stays in memory instead of creating an empty session file.
    if (messages.length === 0 && this.drafts.has(id)) return session;
    await this.write(session);
    return session;
  }

  async saveSubagent(id: string, workspace: string, task: NonNullable<StoredSession['subagent']>): Promise<void> {
    const session = await this.load(id, workspace);
    session.subagent = { ...task, updatedAt: new Date().toISOString() };
    await this.write(session);
  }

  async saveWorktree(id: string, workspace: string, worktree: StoredSession['worktree']): Promise<void> {
    const session = await this.load(id, workspace);
    session.worktree = worktree;
    await this.write(session);
  }

  async saveUsage(id: string, workspace: string, usage: TokenUsageSnapshot): Promise<StoredSession> {
    const session = await this.load(id, workspace);
    if (!isTokenUsageSnapshot(usage) || usage.messageCount > session.messages.length) {
      throw new Error('Invalid session usage snapshot.');
    }
    session.usage = usage;
    await this.write(session);
    return session;
  }

  async saveCompaction(id: string, workspace: string, compaction: Compaction): Promise<StoredSession> {
    const session = await this.load(id, workspace);
    session.compaction = compaction;
    await this.write(session);
    return session;
  }

  async savePlan(id: string, workspace: string, plan: TaskPlanSnapshot): Promise<StoredSession> {
    const session = await this.load(id, workspace);
    const serializedPlan = JSON.stringify(plan);
    if (Buffer.byteLength(serializedPlan, 'utf-8') > 256 * 1024) {
      throw new Error('Session task plan exceeds the 256 KB local storage limit.');
    }
    session.plan = plan;
    session.updatedAt = new Date().toISOString();
    await this.write(session);
    return session;
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const stats = await fs.lstat(this.rootDir);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('Session storage path must be a real directory.');
    }
    await fs.chmod(this.rootDir, 0o700);
  }

  private filePath(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid session id.');
    return path.join(this.rootDir, `${id}.json`);
  }

  private async readFile(filePath: string): Promise<StoredSession> {
    const stats = await fs.lstat(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_SESSION_BYTES) {
      throw new Error('Session file is unsafe or too large.');
    }
    const session = JSON.parse(await fs.readFile(filePath, 'utf-8')) as StoredSession;
    if (session.version !== SESSION_VERSION || typeof session.id !== 'string'
      || typeof session.workspace !== 'string' || !Array.isArray(session.messages)
      || session.id !== path.basename(filePath, '.json')) {
      throw new Error('Invalid session file format.');
    }
    if (session.revision !== undefined && (!Number.isSafeInteger(session.revision) || session.revision < 0)) throw new Error('Invalid session revision.');
    validateTranscript(session.messages);
    if (session.plan !== undefined && !isTaskPlanSnapshot(session.plan)) {
      throw new Error('Invalid session task plan.');
    }
    if (session.usage !== undefined && (!isTokenUsageSnapshot(session.usage) || session.usage.messageCount > session.messages.length)) {
      throw new Error('Invalid session usage snapshot.');
    }
    return session;
  }

  private async write(session: StoredSession): Promise<void> {
    await this.ensureDirectory();
    const filePath = this.filePath(session.id);
    const lock = `${filePath}.lock`;
    try { await fs.mkdir(lock, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Session conflict: writer lock exists at ${lock}; retry after the writer exits. An interrupted writer lock requires recovery.`);
      throw error;
    }
    try {
      let current: StoredSession | undefined;
      try { current = await this.readFile(filePath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (current && (current.revision ?? 0) !== (session.revision ?? 0)) throw new Error('Session conflict: snapshot revision changed; reload before saving.');
      const next = { ...session, revision: (current?.revision ?? 0) + 1 };
      const serialized = JSON.stringify(next);
      if (Buffer.byteLength(serialized, 'utf-8') > MAX_SESSION_BYTES) throw new Error('Session exceeds local storage limit.');
      await atomicWriteFile(filePath, serialized, { defaultMode: 0o600 });
      session.revision = next.revision;
      await fs.chmod(filePath, 0o600);
      this.drafts.delete(session.id);
    } finally { await fs.rmdir(lock); }
  }
}

function safeJournalInput(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 64 * 1024 ? undefined : value;
  } catch {
    return undefined;
  }
}

function isTokenUsageSnapshot(value: unknown): value is TokenUsageSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as TokenUsageSnapshot;
  return Number.isSafeInteger(snapshot.totalTokens) && snapshot.totalTokens >= 0
    && Number.isSafeInteger(snapshot.messageCount) && snapshot.messageCount >= 0;
}

function isTaskPlanSnapshot(value: unknown): value is TaskPlanSnapshot {
  if (!value || typeof value !== 'object') return false;
  const plan = value as TaskPlanSnapshot;
  return Number.isSafeInteger(plan.revision) && plan.revision >= 0
    && (plan.mode === 'auto' || plan.mode === 'plan')
    && Array.isArray(plan.tasks) && plan.tasks.length <= 100
    && plan.tasks.every((task) => task && typeof task.id === 'string'
      && typeof task.subject === 'string' && task.subject.length <= 500
      && ['todo', 'doing', 'done', 'failed'].includes(task.status));
}

function firstUserText(messages: ModelMessage[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = typeof message.content === 'string'
      ? message.content
      : message.content.filter((part) => part.type === 'text').map((part) => part.text).join(' ');
    return text.replace(/\s+/g, ' ').slice(0, 72);
  }
  return '';
}

/** Unfinished calls may survive interruption; orphan or duplicate results may not. */
function validateTranscript(messages: ModelMessage[]): void {
  const calls = new Map<string, string>();
  const completed = new Set<string>();
  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant', 'tool'].includes(message.role)) throw new Error('Invalid session message');
    if (typeof message.content === 'string') continue;
    if (!Array.isArray(message.content)) throw new Error('Invalid session message content');
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        if (!part.toolCallId || calls.has(part.toolCallId)) throw new Error('Duplicate session tool call');
        calls.set(part.toolCallId, part.toolName);
      } else if (part.type === 'tool-result') {
        if (calls.get(part.toolCallId) !== part.toolName || completed.has(part.toolCallId)) throw new Error('Invalid session tool result association');
        completed.add(part.toolCallId);
      }
    }
  }
}
