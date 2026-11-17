import { authFetch } from './api-client';

/** Bridge the gateway's line protocol to the current SDK UI message stream. */
export function createChatTransport(onData: (value: unknown) => void) {
  return {
    async sendMessages({ messages, body, headers, abortSignal }: any) {
      const response = await authFetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        signal: abortSignal,
        body: JSON.stringify({ ...body, messages: messages.map((m: any) => ({
          ...m, content: m.content ?? m.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') ?? ''
        })) }),
      });
      if (!response.ok) throw new Error(`Chat request failed (${response.status})`);
      if (!response.body) throw new Error('Chat response has no stream');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      return new ReadableStream({
        async start(controller) {
          let pending = '';
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'text-start', id: 'reply' });
          const consume = (line: string) => {
            if (!line.trim()) return;
            const separator = line.indexOf(':');
            if (separator < 0) throw new Error('Invalid chat stream');
            const kind = line.slice(0, separator);
            const value = JSON.parse(line.slice(separator + 1));
            if (kind === '0') controller.enqueue({ type: 'text-delta', id: 'reply', delta: value });
            else if (kind === '3') throw new Error(typeof value === 'string' ? value : value.message);
            else if (kind === 'data' || kind === '2') {
              for (const item of Array.isArray(value) ? value : [value]) onData(item);
            }
          };
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              pending += value;
              let index: number;
              while ((index = pending.indexOf('\n')) >= 0) {
                consume(pending.slice(0, index));
                pending = pending.slice(index + 1);
              }
            }
            consume(pending);
            controller.enqueue({ type: 'text-end', id: 'reply' });
            controller.enqueue({ type: 'finish' });
            controller.close();
          } catch (error) { controller.error(error); }
          finally { reader.releaseLock(); }
        },
        cancel(reason) { return reader.cancel(reason); },
      });
    },
    async reconnectToStream() { return null; },
  };
}
