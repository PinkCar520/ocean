import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamTextMock, stepCountIsMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  stepCountIsMock: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: streamTextMock,
  stepCountIs: stepCountIsMock,
}));

import { runChatLoop } from './chat.js';

describe('CLI Agent loop transcript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepCountIsMock.mockReturnValue('step-limit');
  });

  it('returns complete assistant/tool response messages for the next turn', async () => {
    const responseMessages = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'file_read', input: { path: 'a.ts' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'file_read', output: { content: 'source' } }] },
      { role: 'assistant', content: [{ type: 'text', text: 'I read the file.' }] },
    ];
    streamTextMock.mockResolvedValue({
      text: Promise.resolve('I read the file.'),
      responseMessages,
    });

    const result = await runChatLoop([], {
      model: {},
      systemPrompt: 'prompt',
      tools: {},
    });

    expect(result.text).toBe('I read the file.');
    expect(result.responseMessages).toEqual(responseMessages);
    expect(stepCountIsMock).toHaveBeenCalledWith(30);
  });

  it('supports a caller step limit', async () => {
    streamTextMock.mockResolvedValue({
      text: Promise.resolve('done'),
      responseMessages: [{ role: 'assistant', content: [{ type: 'text', text: 'done' }] }],
    });
    await runChatLoop([], { model: {}, systemPrompt: '', tools: {}, maxSteps: 12 });
    expect(stepCountIsMock).toHaveBeenCalledWith(12);
  });
});
