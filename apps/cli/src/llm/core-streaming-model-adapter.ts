import { streamText, type ModelMessage } from 'ai';
import type { AgentModelPort, AgentModelDecision } from '@ocean/core';

/** Streaming AI SDK adapter. No tool execute callbacks are exposed to the model. */
export function createAiSdkStreamingModelPort(options: {
  model: Parameters<typeof streamText>[0]['model'];
  systemPrompt: string;
  tools: Record<string, any>;
  onText?: (delta: string) => void;
}): AgentModelPort<ModelMessage> {
  const definitions = Object.fromEntries(Object.entries(options.tools).map(([name, tool]) => {
    const { execute: _execute, ...definition } = tool;
    return [name, definition];
  }));
  return {
    async next(messages, signal): Promise<AgentModelDecision> {
      let text = '';
      const result = streamText({
        model: options.model,
        system: options.systemPrompt,
        messages: [...messages],
        tools: definitions,
        abortSignal: signal,
        maxRetries: 0,
        onChunk: ({ chunk }) => {
          if (chunk.type === 'text-delta') {
            text += chunk.text;
            options.onText?.(chunk.text);
          }
        },
      });
      // Drain the provider stream before reading its final tool calls.
      await result.consumeStream();
      const calls = await result.toolCalls;
      if (calls.length) {
        return {
          kind: 'tools',
          calls: calls.map(call => ({ id: call.toolCallId, name: call.toolName, input: call.input })),
        };
      }
      return { kind: 'complete', text };
    },
  };
}
