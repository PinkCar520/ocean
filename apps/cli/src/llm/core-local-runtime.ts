import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelMessage } from 'ai';
import {
  AgentExecutionEngine,
  type AgentCompletionPort,
  type ToolAuthorization,
} from '@ocean/core';
import { FileRuntimeEventStore } from '../utils/runtime-event-store.js';
import { SessionTranscriptPort } from '../utils/agent-transcript-port.js';
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
  signal?: AbortSignal;
  resume?: boolean;
}) {
  const { host, resolveTool } = createCliToolHost(options.tools);
  const engine = new AgentExecutionEngine<ModelMessage>({
    events: new FileRuntimeEventStore(options.runtimeDirectory ?? join(homedir(), '.ocean', 'runtime')),
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
    reconcileRecovery: options.reconcileRecovery,
    verifyToolJournal: options.verifyToolJournal,
    verifyTranscript: options.verifyTranscript,
    prepareContext: options.prepareContext,
    authorization: options.authorization,
    activatedSkill: options.activatedSkill,
    resolveTool,
    toMessage: decision => ({ role: 'assistant', content: decision.kind === 'complete' ? decision.text : '' }),
    toMessages: (decision, result) => {
      if (decision.kind === 'complete') return [{ role: 'assistant', content: decision.text }];
      const call = decision.calls[0];
      return [
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: call.id, toolName: call.name, input: call.input }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: call.id, toolName: call.name, output: { type: 'json', value: result ?? null } }] },
      ] as ModelMessage[];
    },
    completion: options.completion,
  });
  return options.resume
    ? engine.resume(options.sessionId, options.runId, options.maxSteps, options.signal)
    : engine.run(options.sessionId, options.runId, options.maxSteps, options.signal);
}
