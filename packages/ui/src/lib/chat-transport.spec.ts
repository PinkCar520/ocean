import { describe, it, expect, vi } from 'vitest';
import { createChatTransport } from './chat-transport';
import { authFetch } from './api-client';
vi.mock('./api-client', () => ({ authFetch: vi.fn() }));
async function read(stream: ReadableStream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const result = await reader.read();
    if (result.done) return chunks;
    chunks.push(result.value);
  }
}
describe('chat transport', () => {
  it('decodes split lines, final lines and artifact events', async () => {
    vi.mocked(authFetch).mockResolvedValue(new Response(new ReadableStream({ start(c) {
      for (const text of ['0:"hel', 'lo"\ndata:{"type":"artifact"}\n', '0:" world"']) c.enqueue(new TextEncoder().encode(text));
      c.close();
    } })));
    const onData = vi.fn();
    const stream = await createChatTransport(onData).sendMessages({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }], body: { sessionId: 's' } });
    const chunks = await read(stream);
    expect(chunks.filter(c => c.type === 'text-delta').map(c => c.delta).join('')).toBe('hello world');
    expect(onData).toHaveBeenCalledWith({ type: 'artifact' });
    expect(JSON.parse(vi.mocked(authFetch).mock.calls[0][1]!.body as string).messages[0].content).toBe('Hi');
  });
  it('surfaces gateway errors', async () => {
    vi.mocked(authFetch).mockResolvedValue(new Response('3:{"message":"Run failed"}\n'));
    await expect(read(await createChatTransport(vi.fn()).sendMessages({ messages: [] }))).rejects.toThrow('Run failed');
  });
});
