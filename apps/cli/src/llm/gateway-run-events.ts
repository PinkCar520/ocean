import { runEventSchema, type RunEvent } from '@ocean/contracts';
import { setTimeout } from 'node:timers/promises';

export interface OceanRunEventsOptions {
  gatewayUrl: string;
  apiKey: string;
  runId: string;
  after?: number;
  signal?: AbortSignal;
}

function parseFrame(frame: string) {
  let event = '';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join('\n') };
}

/** Observe a Run, reconnecting from the most recent delivered event. */
export async function* streamOceanRunEvents(options: OceanRunEventsOptions): AsyncGenerator<RunEvent> {
  if (options.after !== undefined && (!Number.isSafeInteger(options.after) || options.after < 0)) {
    throw new Error('The event cursor must be a non-negative integer.');
  }
  if (!options.runId) throw new Error('A Run ID is required.');

  const root = options.gatewayUrl.replace(/\/$/, '');
  const endpoint = new URL(`${root}/api/runs/${encodeURIComponent(options.runId)}/events`);
  let cursor = options.after ?? -1;
  let reconnects = 0;
  while (reconnects <= 4) {
    options.signal?.throwIfAborted();
    if (cursor >= 0) endpoint.searchParams.set('after', String(cursor));
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${options.apiKey}`, 'x-api-key': options.apiKey, Accept: 'text/event-stream' },
      signal: options.signal,
    }).catch((error: unknown) => {
      options.signal?.throwIfAborted();
      if (!(error instanceof TypeError)) throw error;
      return undefined;
    });
    if (response && (!response.ok || !response.body)) {
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`Gateway event stream failed: HTTP ${response.status}`);
      }
      await response.body?.cancel();
    } else if (response?.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const chunk = await reader.read().catch((error: unknown) => {
            options.signal?.throwIfAborted();
            if (!(error instanceof TypeError)) throw error;
            return undefined;
          });
          if (!chunk || chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          for (;;) {
            const boundary = /\r?\n\r?\n/.exec(buffer);
            if (!boundary) break;
            const { event, data } = parseFrame(buffer.slice(0, boundary.index));
            buffer = buffer.slice(boundary.index + boundary[0].length);
            if (event === 'done') return;
            if (event === 'error') throw new Error('Gateway stopped streaming Run events.');
            if (event !== 'run') continue;
            const runEvent = runEventSchema.parse(JSON.parse(data));
            if (runEvent.runId !== options.runId) throw new Error('Gateway returned an event for a different Run.');
            if (runEvent.sequence <= cursor) continue;
            cursor = runEvent.sequence;
            reconnects = 0;
            yield runEvent;
          }
          if (buffer.length > 8 * 1024 * 1024) throw new Error('Gateway event exceeded the stream limit.');
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
    reconnects++;
    if (reconnects <= 4) await setTimeout(Math.min(1000 * reconnects, 3000), undefined, { signal: options.signal });
  }
  throw new Error('Gateway event stream disconnected before the Run finished.');
}
