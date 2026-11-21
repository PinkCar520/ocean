import { createServer } from 'node:http';
import { once } from 'node:events';

interface ChatRequest {
  model: string;
  stream: boolean;
  messages: Array<{ role: string; content: string | null; tool_call_id?: string }>;
  tools?: Array<{ function: { name: string } }>;
}

export async function startProviderContract() {
  const requests: ChatRequest[] = [];
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }

      let body = '';
      for await (const part of req) body += part;
      const request = JSON.parse(body) as ChatRequest;
      requests.push(request);
      const continued = request.messages.some(({ role }) => role === 'tool');
      const chunks = continued
        ? [{ role: 'assistant', content: 'OCEAN_PROVIDER_' }, { content: 'OK' }]
        : [{ role: 'assistant', tool_calls: [{
          index: 0, id: 'provider-echo', type: 'function',
          function: { name: 'echo', arguments: '{"text":"provider-round-trip"}' },
        }] }];

      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const envelope = {
        id: 'provider-contract', object: 'chat.completion.chunk',
        created: 1, model: request.model,
      };
      for (const delta of chunks) {
        res.write(`data: ${JSON.stringify({ ...envelope, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({
        ...envelope,
        choices: [{ index: 0, delta: {}, finish_reason: continued ? 'stop' : 'tool_calls' }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
      })}\n\n`);
      res.end('data: [DONE]\n\n');
    } catch {
      res.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Provider requires a TCP address');
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}
