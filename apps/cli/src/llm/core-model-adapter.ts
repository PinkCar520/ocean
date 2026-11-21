import { generateText, type ModelMessage } from 'ai';
import type { AgentModelPort, AgentModelDecision } from '@ocean/core';

/** AI SDK adapter for the portable Agent Core. The model never executes tools.
 * Tool effects are exclusively dispatched by the host ToolRuntime.
 */
export function createAiSdkModelPort(options: {
  model: Parameters<typeof generateText>[0]['model'];
  systemPrompt: string;
  tools: Record<string, any>;
}): AgentModelPort<ModelMessage> {
  const definitions = Object.fromEntries(
    Object.entries(options.tools).map(([name, tool]) => {
      const { execute: _execute, ...definition } = tool;
      return [name, definition];
    }),
  );
  return {
    async next(messages, signal): Promise<AgentModelDecision> {
      const result = await generateText({
        model: options.model,
        system: options.systemPrompt,
        messages: [...messages],
        tools: definitions,
        maxRetries: 0,
        abortSignal: signal,
      });
      if (result.toolCalls.length) {
        return {
          kind: 'tools',
          calls: result.toolCalls.map(call => ({
            id: call.toolCallId,
            name: call.toolName,
            input: call.input,
          })),
        };
      }
      return { kind: 'complete', text: result.text };
    },
  };
}
