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
  prepareContext?: (messages: readonly ModelMessage[], signal?: AbortSignal) => Promise<readonly ModelMessage[]>;
  runtimeDirectory?: string;
  maxSteps?: number;
  signal?: AbortSignal;
}) {
  const { host, resolveTool } = createCliToolHost(options.tools);
  const engine = new AgentExecutionEngine<ModelMessage>({
    events: new FileRuntimeEventStore(options.runtimeDirectory ?? join(homedir(), '.ocean', 'runtime')),
    host,
    model: createAiSdkModelPort({
      model: options.model,
      systemPrompt: options.systemPrompt,
      tools: options.tools,
    }),
    transcript: new SessionTranscriptPort(options.sessionStore, options.workspace),
    prepareContext: options.prepareContext,
    authorization: options.authorization,
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
  return engine.run(options.sessionId, options.runId, options.maxSteps, options.signal);
}
