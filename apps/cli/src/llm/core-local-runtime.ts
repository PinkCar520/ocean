import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelMessage } from 'ai';
import {
  AgentExecutionEngine,
  normalizeToolOutput,
  type AgentCompletionPort,
  type ToolAuthorization,
} from '@ocean/core';
import { FileRuntimeEventStore } from '../utils/runtime-event-store.js';
import { SessionTranscriptPort } from '../utils/agent-transcript-port.js';
import { createCliRuntimeRecovery } from '../utils/core-runtime-recovery.js';
import type { SessionStore } from '../utils/session-store.js';
import { createCliToolHost } from '../tools/core-tool-adapter.js';
import { createAiSdkModelPort } from './core-model-adapter.js';
import { createAiSdkStreamingModelPort } from './core-streaming-model-adapter.js';

/**
 * Programmatic local execution entrypoint for Ocean Core v2.
 * Existing interactive runChatLoop remains intact during migration.
 */
export async function runOceanCoreLocal(options: {
  sessionStore: SessionStore;
  sessionId: string;
  runId: string;
  workspace: string;
  model: Parameters<typeof createAiSdkModelPort>[0]['model'];
  systemPrompt: string;
  tools: Record<string, any>;
  authorization: ToolAuthorization;
  completion: AgentCompletionPort<ModelMessage>;
  reconcileRecovery?: import('@ocean/core').AgentExecutionPorts<ModelMessage>['reconcileRecovery'];
  verifyTranscript?: import('@ocean/core').AgentExecutionPorts<ModelMessage>['verifyTranscript'];
  verifyToolJournal?: import('@ocean/core').AgentExecutionPorts<ModelMessage>['verifyToolJournal'];
  prepareContext?: (messages: readonly ModelMessage[], signal?: AbortSignal) => Promise<readonly ModelMessage[]>;
  activatedSkill?: (toolName: string, result: unknown) => { id: string; source: 'plugin' | 'user' | 'project' } | undefined;
  runtimeDirectory?: string;
  maxSteps?: number;
  streaming?: boolean;
  onText?: (delta: string) => void;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, result: unknown) => void;
  beforeToolUse?: (name: string, input: unknown, callId: string) => Promise<string | undefined>;
  afterToolUse?: (name: string, input: unknown, callId: string, output: unknown) => Promise<unknown>;
  onToolFailure?: (name: string, input: unknown, callId: string, error: unknown) => Promise<void>;
  signal?: AbortSignal;
  resume?: boolean;
}) {
  const { host: rawHost, resolveTool } = createCliToolHost(options.tools);
  // The Core write-ahead event precedes this host call. The existing CLI
  // journal provides a second durable side-effect fence before dispatch.
  // Stable call IDs are never replayed, even if the model/provider retries.
  const host: import('@ocean/core').RuntimeHost = {
    execute: invocation => options.sessionStore.executeToolCall(
      options.sessionId,
      options.workspace,
      invocation.id,
      invocation.toolName,
      invocation.input,
      async () => {
        try {
          const blocked = await options.beforeToolUse?.(invocation.toolName, invocation.input, invocation.id);
          if (blocked) return { error: blocked };
          const output = await rawHost.execute(invocation);
          const transformed = options.afterToolUse
            ? await options.afterToolUse(invocation.toolName, invocation.input, invocation.id, output)
            : output;
          return normalizeToolOutput(transformed);
        } catch (error) {
          await options.onToolFailure?.(invocation.toolName, invocation.input, invocation.id, error);
          throw error;
        }
      },
    ),
  };
  const events = new FileRuntimeEventStore(options.runtimeDirectory ?? join(homedir(), '.ocean', 'runtime'));
  const recovery = createCliRuntimeRecovery(options.sessionStore, options.workspace, events);
  const engine = new AgentExecutionEngine<ModelMessage>({
    events,
    host,
    model: options.streaming
      ? createAiSdkStreamingModelPort({
          model: options.model,
          systemPrompt: options.systemPrompt,
          tools: options.tools,
          onText: options.onText,
        })
      : createAiSdkModelPort({
          model: options.model,
          systemPrompt: options.systemPrompt,
          tools: options.tools,
        }),
    transcript: new SessionTranscriptPort(options.sessionStore, options.workspace),
    reconcileRecovery: async (sessionId, runId, history) => {
      await recovery.reconcileRecovery(sessionId, runId, history);
      await options.reconcileRecovery?.(sessionId, runId, await events.read(runId));
    },
    verifyToolJournal: async (sessionId, runId, history) =>
      await recovery.verifyToolJournal(sessionId, runId, history) &&
      (!options.verifyToolJournal || await options.verifyToolJournal(sessionId, runId, await events.read(runId))),
    verifyTranscript: async (sessionId, runId, history) =>
      await recovery.verifyTranscript(sessionId) &&
      (!options.verifyTranscript || await options.verifyTranscript(sessionId, runId, history)),
    prepareContext: options.prepareContext,
    authorization: options.authorization,
    activatedSkill: options.activatedSkill,
    resolveTool,
    onToolCall: options.onToolCall,
    onToolResult: options.onToolResult,
    toMessage: decision => ({ role: 'assistant', content: decision.kind === 'complete' ? decision.text : '' }),
    toMessages: (decision, result) => {
      if (decision.kind === 'complete') return [{ role: 'assistant', content: decision.text }];
      const call = decision.calls[0];
      return [
        { role: 'assistant', content: [
          ...(decision.text ? [{ type: 'text', text: decision.text }] : []),
          { type: 'tool-call', toolCallId: call.id, toolName: call.name, input: call.input },
        ] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: call.id, toolName: call.name, output: { type: 'json', value: result ?? null } }] },
      ] as ModelMessage[];
    },
    completion: options.completion,
  });
  return options.resume
    ? engine.resume(options.sessionId, options.runId, options.maxSteps, options.signal)
    : engine.run(options.sessionId, options.runId, options.maxSteps, options.signal);
}
