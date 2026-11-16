import { createHash } from 'node:crypto';
import type { SessionStore, StoredSession } from '../utils/session-store.js';
import { z } from 'zod';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ModelMessage } from 'ai';
import type { runChatLoop } from '../llm/chat.js';
export interface SubagentDefinition { name: string; description: string; prompt: string; tools: string[]; maxSteps: number }
const READ_ONLY = new Set(['file_read', 'grep', 'glob']);

export function loadSubagents(workspace: string, home = homedir()): SubagentDefinition[] {
  const definitions = new Map<string, SubagentDefinition>();
  for (const root of [home, workspace]) {
    for (const relative of ['.claude/agents', '.ocean/agents']) {
      const dir = join(root, relative);
      let entries;
      try { if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) continue; entries = readdirSync(dir, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const file = join(dir, entry.name);
        if (lstatSync(file).size > 64 * 1024) continue;
        const match = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match) continue;
        const fields = Object.fromEntries(match[1].split('\n').map((line) => line.match(/^([\w-]+):\s*(.*?)\s*$/)).filter(Boolean).map((line) => [line![1], line![2].replace(/^["']|["']$/g, '')]));
        if (!/^[\w-]{1,64}$/.test(fields.name ?? '') || !fields.description) continue;
        const maxSteps = Number(fields.maxTurns ?? 8);
        if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 16) continue;
        definitions.set(fields.name, { name: fields.name, description: fields.description, prompt: match[2], tools: (fields.tools ?? 'file_read,grep,glob').split(/[, ]+/).filter(Boolean), maxSteps });
      }
    }
  }
  return [...definitions.values()];
}

export function createDelegationTool(definitions: SubagentDefinition[], parent: {
  model: any; tools: Record<string, any>; systemPrompt: string;
  signal?: AbortSignal; approvalHandler?: Parameters<typeof runChatLoop>[1]['approvalHandler'];
  run: typeof runChatLoop;
  history?: ModelMessage[];
  persistence?: { store: SessionStore; sessionId: string; workspace: string };
  /** Future writers must supply a separate authorization boundary; currently no write tools are exposed. */
  authorizeWrite?: (tool: string, input: unknown) => Promise<boolean>;
}) {
  const pending = new Map<string, { fingerprint: string; promise: Promise<unknown> }>();
  let busy = false;
  let remaining = 4;
  return {
    description: `Delegate an independent read-only task. Available agents: ${definitions.map((agent) => `${agent.name}: ${agent.description}`).join('; ')}`,
    inputSchema: z.object({ agent: z.string().min(1), task: z.string().min(1).max(16000) }),
    async execute(input: { agent: string; task: string }, execution: { toolCallId?: string; abortSignal?: AbortSignal } = {}): Promise<any> {
      const signal = parent.signal && execution.abortSignal ? AbortSignal.any([parent.signal, execution.abortSignal]) : parent.signal ?? execution.abortSignal;
      signal?.throwIfAborted();
      if (!execution.toolCallId) throw new Error('Delegation requires a stable tool call id');
      const id = execution.toolCallId;
      const fingerprint = JSON.stringify(input);
      const existing = pending.get(id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error('Delegation id reused with different input');
        return existing.promise;
      }
      // Completed parent tool results are the existing persisted recovery boundary.
      for (const message of parent.history ?? []) {
        if (message.role !== 'tool' || !Array.isArray(message.content)) continue;
        const result = message.content.find((part) => part.type === 'tool-result' && part.toolName === 'delegate_task' && part.toolCallId === id);
        if (result && result.type === 'tool-result') return (result.output as any)?.value ?? result.output;
      }
      const definition = definitions.find((agent) => agent.name === input.agent);
      if (!definition) throw new Error('Unknown subagent');
      if (busy) throw new Error('Subagent concurrency limit reached');
      if (remaining-- <= 0) throw new Error('Delegation budget exhausted');
      busy = true;
      const promise = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('Subagent time budget exceeded')), 60_000);
        let task: NonNullable<StoredSession['subagent']> | undefined;
        let childId: string | undefined;
        const persistence = parent.persistence;
        try {
          if (persistence) {
            childId = createHash('sha256').update(JSON.stringify([persistence.sessionId, id])).digest('hex');
            let child;
            try { child = await persistence.store.load(childId, persistence.workspace); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; child = await persistence.store.create(persistence.workspace, `Subagent ${definition.name}`, childId); }
            const inputDigest = createHash('sha256').update(fingerprint).digest('hex');
            if (child.subagent) {
              if (child.subagent.inputDigest !== inputDigest || child.subagent.parentSessionId !== persistence.sessionId) throw new Error('Subagent identity conflicts with persisted input');
              if (child.subagent.status === 'succeeded') return child.subagent.result;
              throw new Error('Subagent outcome unknown or terminal; automatic replay prohibited');
            }
            task = { ownerPid: process.pid, parentSessionId: persistence.sessionId, toolCallId: id, agent: definition.name, inputDigest, status: 'prepared' };
            await persistence.store.saveSubagent(childId, persistence.workspace, task);
            task.status = 'running'; await persistence.store.saveSubagent(childId, persistence.workspace, task);
          }
          const tools = Object.fromEntries(Object.entries(parent.tools).filter(([name]) => READ_ONLY.has(name) && definition.tools.includes(name)));
          const result = await parent.run([{ role: 'user', content: input.task }], {
            model: parent.model, tools,
            systemPrompt: `${parent.systemPrompt}\nYou are a read-only subagent. Complete only the delegated task.\n${definition.prompt}`,
            maxSteps: definition.maxSteps,
            ...(persistence && childId ? { journal: { store: persistence.store, sessionId: childId, workspace: persistence.workspace } } : {}),
            approvalHandler: parent.approvalHandler,
            signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
            // No delegation context: nesting is disabled.
          });
          signal?.throwIfAborted(); controller.signal.throwIfAborted();
          const output = { taskId: childId ?? id, agent: definition.name, result: result.text.slice(0, 32000) };
          if (persistence && childId && task) { task.status = 'succeeded'; task.result = output; await persistence.store.saveSubagent(childId, persistence.workspace, task); }
          return output;
        } catch (error) {
          if (persistence && childId && task) {
            task.status = signal?.aborted || controller.signal.aborted ? 'cancelled' : 'unknown'; task.error = String(error);
            await persistence.store.saveSubagent(childId, persistence.workspace, task);
          }
          throw error;
        } finally { clearTimeout(timer); busy = false; }
      })();
      pending.set(id, { fingerprint, promise });
      return promise;
    },
  };
}
