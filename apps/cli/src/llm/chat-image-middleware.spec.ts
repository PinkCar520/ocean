import { createOpenAI } from '@ai-sdk/openai';
import { generateText, wrapLanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';
import { chatImageMiddleware } from './chat-image-middleware.js';

describe('chat image transport', () => {
  it('sends tool images as user image parts after all corresponding tool results', async () => {
    let request: any;
    const model = wrapLanguageModel({
      model: createOpenAI({ apiKey: 'test', fetch: async (_input, init) => {
        request = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'reply', model: 'test', choices: [{ index: 0, message: { role: 'assistant', content: 'seen' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
      } }).chat('test'),
      middleware: chatImageMiddleware,
    });
    await generateText({ model, messages: [
      { role: 'user', content: 'Read the images' },
      { role: 'assistant', content: [
        { type: 'tool-call', toolCallId: 'one', toolName: 'file_read', input: { path: 'a.png' } },
        { type: 'tool-call', toolCallId: 'two', toolName: 'file_read', input: { path: 'b.png' } },
      ] },
      { role: 'tool', content: [
        { type: 'tool-result', toolCallId: 'one', toolName: 'file_read', output: { type: 'content', value: [{ type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aGVsbG8=' } }] } },
        { type: 'tool-result', toolCallId: 'two', toolName: 'file_read', output: { type: 'text', value: 'another result' } },
      ] },
    ] });
    expect(request.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'user']);
    expect(request.messages[4].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } });
    expect(request.messages[2].content).not.toContain('aGVsbG8=');
  });
});
