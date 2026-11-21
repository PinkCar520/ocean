import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { ModelMessage } from 'ai';
import {
  AgentRuntime,
  replayRuntime,
  type RuntimeEvent,
  type RuntimeEventStore,
} from '@ocean/core';
import type { SessionStore } from './session-store.js';

type ToolCall = Extract<RuntimeEvent, { type: 'tool.prepared' }>;
type ToolResult = Extract<RuntimeEvent, { type: 'tool.settled' | 'tool.reconciled' }>;

function parts(messages: readonly ModelMessage[], id: string) {
  let call: { toolCallId: string; toolName: string; input: unknown } | undefined;
  let result: { toolCallId: string; toolName: string; output: unknown } | undefined;
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === 'tool-call' && part.toolCallId === id) {
        if (call) throw new Error('Duplicate persisted tool call');
        call = part;
      }
      if (part.type === 'tool-result' && part.toolCallId === id) {
        if (result) throw new Error('Duplicate persisted tool result');
        result = part;
      }
    }
  }
  return { call, result };
}

function transcriptClosed(messages: readonly ModelMessage[]): boolean {
  const calls = new Map<string, string>(), settled = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        if (calls.has(part.toolCallId)) return false;
        calls.set(part.toolCallId, part.toolName);
      } else if (part.type === 'tool-result') {
        if (!calls.has(part.toolCallId) || calls.get(part.toolCallId) !== part.toolName ||
            settled.has(part.toolCallId)) return false;
        settled.add(part.toolCallId);
      }
    }
  }
  return calls.size === settled.size;
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Local Host recovery relies only on durable journal and Core event evidence.
 * It never retries a tool. Missing or unknown results fail closed.
 */
export function createCliRuntimeRecovery(
  sessions: SessionStore, workspace: string, store: RuntimeEventStore,
) {
  const runtime = new AgentRuntime(store, {
    execute: async () => { throw new Error('Recovery must never execute tools'); },
  });

  return {
    reconcileRecovery: async (sessionId: string, runId: string, history: readonly RuntimeEvent[]): Promise<void> => {
      for (const event of history) {
        if (event.type !== 'tool.prepared') continue;
        const journal = await sessions.readToolCallJournal(sessionId, workspace, event.invocation.id);
        if (!journal || journal.toolName !== event.invocation.toolName ||
            journal.inputDigest !== event.invocation.inputDigest)
          throw new Error('Tool journal identity does not match the Core invocation');
        const snapshot = await runtime.snapshot(runId);
        const state = snapshot.pendingTools[event.invocation.id];
        if (journal.state !== 'succeeded' && journal.state !== 'failed') continue;
        if (state === 'prepared') {
          await runtime.settlePreparedTool(runId, event.invocation.id, journal.state, journal.output);
        } else if (state === 'unknown') {
          await runtime.reconcileTool(runId, event.invocation.id, journal.state, journal.output);
        } else if (state !== journal.state) {
          throw new Error('Tool journal and Core outcome disagree');
        }
      }
    },
    verifyTranscript: async (sessionId: string): Promise<boolean> => {
      const session = await sessions.loadPersisted(sessionId, workspace);
      return transcriptClosed(session.messages);
    },
    verifyToolJournal: async (
      sessionId: string, runId: string, history: readonly RuntimeEvent[],
    ): Promise<boolean> => {
      const state = replayRuntime(runId, history);
      const prepared = history.filter((event): event is ToolCall => event.type === 'tool.prepared');
      if (Object.keys(state.queuedTools).some(id => !Object.hasOwn(state.pendingTools, id))) return false;
      const settled = new Map<string, ToolResult>();
      for (const event of history) {
        if (event.type === 'tool.settled' || event.type === 'tool.reconciled')
          settled.set(event.invocationId, event);
      }
      const session = await sessions.loadPersisted(sessionId, workspace);
      const transcript = [...session.messages];
      for (const event of prepared) {
        const { invocation } = event;
        const journal = await sessions.readToolCallJournal(sessionId, workspace, invocation.id);
        const recorded = settled.get(invocation.id);
        if (!journal || journal.toolName !== invocation.toolName ||
            journal.inputDigest !== invocation.inputDigest ||
            !recorded || (journal.state !== 'succeeded' && journal.state !== 'failed') ||
            state.pendingTools[invocation.id] !== journal.state ||
            recorded.outcome !== journal.state ||
            !isDeepStrictEqual(recorded.result, journal.output)) return false;

        const pair = parts(transcript, invocation.id);
        if (pair.call && (pair.call.toolName !== invocation.toolName ||
            digest(pair.call.input) !== invocation.inputDigest)) return false;
        if (pair.result && (!pair.call || pair.result.toolName !== invocation.toolName)) return false;
        if (pair.result) {
          const output = pair.result.output;
          const value = output && typeof output === 'object' && 'type' in output &&
            output.type === 'json' && 'value' in output ? output.value : output;
          if (!isDeepStrictEqual(value, recorded.result)) return false;
          continue;
        }
        // Only append at the tail of the durable transcript. Never invent a
        // tool effect; the journal plus settled Core event prove its identity.
        const next: ModelMessage[] = [
          ...(pair.call ? [] : [{
            role: 'assistant',
            content: [{
              type: 'tool-call', toolCallId: invocation.id,
              toolName: invocation.toolName, input: invocation.input,
            }],
          } as ModelMessage]),
          {
            role: 'tool',
            content: [{
              type: 'tool-result', toolCallId: invocation.id,
              toolName: invocation.toolName,
              output: { type: 'json', value: recorded.result ?? null },
            }],
          } as ModelMessage,
        ];
        await sessions.appendMessages(sessionId, workspace, transcript.length, next);
        transcript.push(...next);
      }
      return transcriptClosed(transcript);
    },
  };
}
