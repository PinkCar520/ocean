import { describe, expect, it, vi, beforeEach } from 'vitest';

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

describe('Streaming tool-call error recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    stepCountIsMock.mockReturnValue('step-limit');
  });

  function makeStreamResult(overrides: Record<string, unknown> = {}) {
    return {
      text: Promise.resolve('ok'),
      finishReason: Promise.resolve('stop'),
      responseMessages: Promise.resolve([]),
      ...overrides,
    };
  }

  it('retries once on finishReason "other" and succeeds on second attempt', async () => {
    let call = 0;
    streamTextMock.mockImplementation(() => {
      call++;
      if (call === 1) {
        return makeStreamResult({ finishReason: Promise.resolve('other') });
      }
      return makeStreamResult({ text: Promise.resolve('recovered') });
    });

    const result = await runChatLoop([], { model: {}, systemPrompt: '', tools: {} });
    expect(result.text).toBe('recovered');
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on finishReason "other"', async () => {
    streamTextMock.mockReturnValue(makeStreamResult({ finishReason: Promise.resolve('other') }));
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: {} }))
      .rejects.toThrow('Model stream incomplete');
    // One initial attempt + one retry
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the abort signal fires', async () => {
    const controller = new AbortController();
    streamTextMock.mockImplementation(async () => {
      controller.abort();
      throw new Error('aborted');
    });
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: {}, signal: controller.signal }))
      .rejects.toThrow();
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('retries on transient network errors', async () => {
    let call = 0;
    streamTextMock.mockImplementation(async () => {
      call++;
      if (call === 1) throw new Error('fetch failed');
      return makeStreamResult({ text: Promise.resolve('ok after network') });
    });
    const result = await runChatLoop([], { model: {}, systemPrompt: '', tools: {} });
    expect(result.text).toBe('ok after network');
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });

  it('passes maxOutputTokens to streamText', async () => {
    streamTextMock.mockReturnValue(makeStreamResult());
    await runChatLoop([], { model: {}, systemPrompt: '', tools: {}, maxTokens: 16384 });
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 16384 }),
    );
  });

  it('defaults maxOutputTokens to 8192 when not specified', async () => {
    streamTextMock.mockReturnValue(makeStreamResult());
    await runChatLoop([], { model: {}, systemPrompt: '', tools: {} });
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8192 }),
    );
  });

  it('does not execute incomplete tool calls (JSON parse error is surfaced, not silently executed)', async () => {
    const execute = vi.fn();
    // Simulate the AI SDK throwing when tool-call arguments are invalid JSON
    streamTextMock.mockImplementation(async () => {
      throw new Error('Unterminated string in JSON at position 2887');
    });
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: { commit: { execute } } }))
      .rejects.toThrow('Unterminated string');
    expect(execute).not.toHaveBeenCalled();
  });

  it('limits retries to MAX_STREAM_RETRIES (no infinite loop)', async () => {
    streamTextMock.mockReturnValue(makeStreamResult({ finishReason: Promise.resolve('other') }));
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: {} }))
      .rejects.toThrow();
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });
});
