import type { Compaction } from '../llm/compaction.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { atomicWriteFile } from './file-system.js';
import type { TaskPlanSnapshot } from './task-manager.js';

const SESSION_VERSION = 1;
const MAX_SESSION_BYTES = 20 * 1024 * 1024;

export interface StoredSession {
  version: 1;
  id: string;
  workspace: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ModelMessage[];
  plan?: TaskPlanSnapshot;
  compaction?: Compaction;
  worktree?: { path: string; branch: string; runId?: string };
}

export class SessionStore {
  constructor(private readonly rootDir = path.join(os.homedir(), '.ocean', 'sessions')) {}

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
    const latest = (await this.list(workspace))[0];
    return latest ?? this.create(workspace);
  }

  async create(workspace: string, title = 'New session'): Promise<StoredSession> {
    await this.ensureDirectory();
    const now = new Date().toISOString();
    const session: StoredSession = {
      version: SESSION_VERSION,
      id: randomUUID(),
      workspace: path.resolve(workspace),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await this.write(session);
    return session;
  }

  async load(id: string, workspace: string): Promise<StoredSession> {
    const session = await this.readFile(this.filePath(id));
    if (session.workspace !== path.resolve(workspace)) {
      throw new Error('Session belongs to a different workspace.');
    }
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
    session.updatedAt = new Date().toISOString();
    if (session.title === 'New session') session.title = firstUserText(messages) || session.title;
    await this.write(session);
    return session;
  }

  async saveWorktree(id: string, workspace: string, worktree: StoredSession['worktree']): Promise<void> {
    const session = await this.load(id, workspace);
    session.worktree = worktree;
    await this.write(session);
  }

  async saveCompaction(id: string, workspace: string, compaction: Compaction): Promise<void> {
    const session = await this.load(id, workspace);
    session.compaction = compaction;
    await this.write(session);
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
    validateTranscript(session.messages);
    if (session.plan !== undefined && !isTaskPlanSnapshot(session.plan)) {
      throw new Error('Invalid session task plan.');
    }
    return session;
  }

  private async write(session: StoredSession): Promise<void> {
    await this.ensureDirectory();
    const filePath = this.filePath(session.id);
    const serialized = JSON.stringify(session);
    if (Buffer.byteLength(serialized, 'utf-8') > MAX_SESSION_BYTES) {
      throw new Error(`Session exceeds the ${MAX_SESSION_BYTES / 1024 / 1024} MB local storage limit.`);
    }
    await atomicWriteFile(filePath, serialized, { defaultMode: 0o600 });
    await fs.chmod(filePath, 0o600);
  }
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
