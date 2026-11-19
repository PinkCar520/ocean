jest.mock('ai', () => ({ wrapLanguageModel: jest.fn((options: any) => options) }));
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn(() => ({ chat: jest.fn(() => 'chat-model') })) }));
jest.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: jest.fn(() => jest.fn(() => 'deepseek-model')),
}));

import { createDeepSeek } from '@ai-sdk/deepseek';
import { createChatModel, createChatProviderOptions } from './model.factory';

it('uses the official DeepSeek provider with configured endpoint and model options', () => {
  const values: Record<string, string> = {
    DEFAULT_AI_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_BASE_URL: 'https://deepseek.example/v1',
    DEEPSEEK_MODEL: 'deepseek-flash',
  };
  const config = { get: (key: string) => values[key] };

  const model = createChatModel(config as never);

  expect(createDeepSeek).toHaveBeenCalledWith({
    apiKey: 'test-key',
    baseURL: 'https://deepseek.example/v1',
  });
  expect(
    (createDeepSeek as jest.Mock).mock.results[0].value,
  ).toHaveBeenCalledWith('deepseek-flash');
  expect(model.model).toBe('deepseek-model');
  expect(createChatProviderOptions(config as never)).toEqual({
    deepseek: {
      thinking: { type: 'enabled' },
      reasoningEffort: 'high',
    },
  });
  expect(createChatProviderOptions(config as never, 'deepseek-flash', 'max'))
    .toMatchObject({ deepseek: { reasoningEffort: 'max' } });
});

it('does not set DeepSeek provider options for other providers', () => {
  const config = {
    get: (key: string) =>
      ({ DEFAULT_AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-4.1' })[key],
  };

  expect(createChatProviderOptions(config as never)).toBeUndefined();
});

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
