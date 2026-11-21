jest.mock('ai', () => ({ streamText: jest.fn() }));
jest.mock('./model.factory', () => ({
  createChatModel: jest.fn(),
  createChatProviderOptions: jest.fn(() => ({
    deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'high' },
  })),
}));
import { toUiMessage } from './ai-sdk-model-gateway';

it('feeds notebook text and images back as multimodal tool content', () => {
  const message = toUiMessage({ role: 'tool', toolCallId: 'call', toolName: 'local_notebook_read', result: {
    kind: 'notebook', parts: [{ type: 'text', text: 'cell' }, { type: 'image', mediaType: 'image/png', base64: 'aGVsbG8=' }],
  } });
  expect(message.content[0]).toMatchObject({ output: { type: 'content', value: [
    { type: 'text', text: 'cell' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aGVsbG8=' } },
  ] } });
});

it('feeds device image reads back as multimodal tool content', () => {
  const message = toUiMessage({ role: 'tool', toolCallId: 'call', toolName: 'local_file_read', result: {
    kind: 'image', path: 'image.png', mediaType: 'image/png', base64: 'aGVsbG8=',
  } });
  expect(message.content[0]).toMatchObject({ output: { type: 'content', value: [
    { type: 'text', text: 'Image: image.png' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aGVsbG8=' } },
  ] } });
});

it('preserves provider input/output and cache usage without inventing missing counters', async () => {
 const { streamText } = require('ai');
 const { AiSdkModelGateway } = await import('./ai-sdk-model-gateway.js');
 const { ConfigService } = require('@nestjs/config');
 streamText.mockReturnValue({ textStream: (async function* () { yield 'ok'; })(), toolCalls: Promise.resolve([]), reasoningText: Promise.resolve('provider continuation'),
  totalUsage: Promise.resolve({ inputTokens: 20, outputTokens: 3, totalTokens: 23, inputTokenDetails: { cacheReadTokens: 12, cacheWriteTokens: 4 } }) });
 const result = await new AiSdkModelGateway(new ConfigService()).generate({ system: 'System instructions', messages: [{ role: 'user', text: 'hello' }] });
 expect(result.reasoning).toBe('provider continuation');
 expect(toUiMessage({ role: 'assistant', reasoning: result.reasoning, text: result.text }).content).toEqual([
  {type: 'reasoning', text: 'provider continuation'}, {type: 'text', text: 'ok'},
 ]);
 expect(result.contextBreakdown?.systemTokens).toBeGreaterThan(0);
 expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 3, totalTokens: 23, cacheReadTokens: 12, cacheWriteTokens: 4 });
 expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
  system: 'System instructions',
  providerOptions: { deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'high' } },
 }));
});
