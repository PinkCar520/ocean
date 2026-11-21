import { describe, expect, it, vi, beforeEach } from 'vitest';

const { createOpenAIMock, createAnthropicMock, createGoogleMock, wrapLanguageModelMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
  createAnthropicMock: vi.fn(),
  createGoogleMock: vi.fn(),
  wrapLanguageModelMock: vi.fn(({ model }: any) => model),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: createAnthropicMock }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: createGoogleMock }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  wrapLanguageModel: wrapLanguageModelMock,
}));

import { createModelRouter } from './model-router.js';

describe('DeepSeek reasoning effort configuration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })) as any;
  });

  function captureFetch(modelId: string, config: Parameters<typeof createModelRouter>[0]) {
    const chatMock = vi.fn();
    createOpenAIMock.mockReturnValue({ chat: chatMock });
    createModelRouter(config).getModel(modelId);
    const openaiConfig = createOpenAIMock.mock.calls[0][0];
    return openaiConfig.fetch;
  }

  it('defaults reasoning_effort to medium and enables thinking', async () => {
    const fetch = captureFetch('deepseek-chat', {
      deepseekApiKey: 'k', deepseekBaseUrl: 'https://api.deepseek.com', deepseekModel: 'deepseek-chat',
    });
    const init: any = { method: 'POST', body: JSON.stringify({ model: 'deepseek-chat' }) };
    await fetch('https://api.deepseek.com/v1/chat/completions', init);
    const body = JSON.parse(init.body);
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.reasoning_effort).toBe('medium');
  });

  it('respects deepseekReasoningEffort high', async () => {
    const fetch = captureFetch('deepseek-chat', {
      deepseekApiKey: 'k', deepseekBaseUrl: 'https://api.deepseek.com', deepseekModel: 'deepseek-chat',
      deepseekReasoningEffort: 'high',
    });
    const init: any = { method: 'POST', body: JSON.stringify({ model: 'deepseek-chat' }) };
    await fetch('https://api.deepseek.com/v1/chat/completions', init);
    const body = JSON.parse(init.body);
    expect(body.reasoning_effort).toBe('high');
  });

  it('disables thinking when deepseekThinking is false', async () => {
    const fetch = captureFetch('deepseek-chat', {
      deepseekApiKey: 'k', deepseekBaseUrl: 'https://api.deepseek.com', deepseekModel: 'deepseek-chat',
      deepseekThinking: false,
    });
    const init: any = { method: 'POST', body: JSON.stringify({ model: 'deepseek-chat' }) };
    await fetch('https://api.deepseek.com/v1/chat/completions', init);
    const body = JSON.parse(init.body);
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('low reasoning effort leaves room for tool-call arguments', async () => {
    const fetch = captureFetch('deepseek-chat', {
      deepseekApiKey: 'k', deepseekBaseUrl: 'https://api.deepseek.com', deepseekModel: 'deepseek-chat',
      deepseekReasoningEffort: 'low',
    });
    const init: any = { method: 'POST', body: JSON.stringify({ model: 'deepseek-chat' }) };
    await fetch('https://api.deepseek.com/v1/chat/completions', init);
    const body = JSON.parse(init.body);
    expect(body.reasoning_effort).toBe('low');
  });
});
