import { describe, expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({ generateText: generate }));

import { createAiSdkModelPort } from './core-model-adapter.js';

describe('AI SDK portable Agent Core adapter', () => {
 it('passes tool schemas to the model but never exposes executors', async () => {
  const execute = vi.fn();
  generate.mockResolvedValueOnce({
   text: 'Preparing echo.', toolCalls: [{ toolCallId: 'call', toolName: 'echo', input: { message: 'hi' } }],
  });
  const port = createAiSdkModelPort({
   model: {} as any,
   systemPrompt: 'system',
   tools: { echo: { description: 'Echo', inputSchema: {}, execute } },
  });
  const decision = await port.next([{ role: 'user', content: 'echo' }]);
  expect(decision).toEqual({ kind: 'tools', text: 'Preparing echo.', calls: [{ id: 'call', name: 'echo', input: { message: 'hi' } }] });
  expect(generate.mock.calls[0][0].tools.echo.execute).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
 });
});
