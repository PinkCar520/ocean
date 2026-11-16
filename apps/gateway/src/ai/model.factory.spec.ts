jest.mock('ai', () => ({ wrapLanguageModel: jest.fn((options: any) => options) }));
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn(() => ({ chat: jest.fn(() => 'chat-model') })) }));

import { createChatModel } from './model.factory';

it('routes chat-completions notebook images into a model-visible user message', async () => {
  const values: Record<string, string> = { DEFAULT_AI_PROVIDER: 'openai', OPENAI_MODEL: 'vision' };
  const config = { get: (key: string) => values[key] };
  const model = createChatModel(config as never);
  expect(model.model).toBe('chat-model');
  const result = await model.middleware.transformParams({ params: { prompt: [
    { role: 'assistant', content: [] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'local_notebook_read', output: { type: 'content', value: [
      { type: 'text', text: 'cell output' },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aGVsbG8=' } },
    ] } }] },
  ] } });
  expect(result.prompt.map((message: any) => message.role)).toEqual(['assistant', 'tool', 'user']);
  expect(result.prompt[2].content[1].data.url.toString()).toBe('data:image/png;base64,aGVsbG8=');
  expect(JSON.stringify(result.prompt[1])).not.toContain('aGVsbG8=');
});
