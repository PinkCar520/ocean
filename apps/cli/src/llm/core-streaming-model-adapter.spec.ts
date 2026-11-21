import { describe, expect, it, vi } from 'vitest';
const stream = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({ streamText: stream }));
import { createAiSdkStreamingModelPort } from './core-streaming-model-adapter.js';

describe('streaming Agent Core model adapter', () => {
 it('streams text while keeping tool execution outside the provider', async () => {
  const execute = vi.fn();
  stream.mockReturnValueOnce({
   consumeStream: async () => undefined,
   toolCalls: Promise.resolve([]),
  });
  const onText = vi.fn();
  const port = createAiSdkStreamingModelPort({
   model: {} as any,
   systemPrompt: 'system',
   tools: { echo: { inputSchema: {}, execute } },
   onText,
  });
  const decision = await port.next([{ role: 'user', content: 'hello' }]);
  expect(decision).toEqual({ kind: 'complete', text: '' });
  expect(stream.mock.calls[0][0].tools.echo.execute).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
 });
});
