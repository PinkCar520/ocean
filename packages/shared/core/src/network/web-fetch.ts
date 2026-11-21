import { EgressPolicy } from './egress-policy.js';

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_REDIRECTS = 5;

export async function fetchWebText(raw: string, policy: EgressPolicy, parentSignal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10_000);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  let url = raw;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const verdict = policy.checkUrl(url);
    if (!verdict.allowed) throw new Error(`egress_denied: ${verdict.host || '(invalid url)'} (reason: ${verdict.reason})`);
    const target = new URL(url);
    if (target.username || target.password) throw new Error('Credentials in Web URLs are unsupported.');
    const response = await fetch(target, { signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('Web redirect limit reached.');
      url = new URL(location, target).href;
      continue;
    }

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    try {
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const remaining = MAX_RESPONSE_BYTES - bytes;
          chunks.push(value.subarray(0, remaining));
          bytes += Math.min(value.length, remaining);
          if (value.length > remaining) {
            truncated = true;
            await reader.cancel();
            break;
          }
        }
      }
    } finally {
      reader?.releaseLock();
    }
    return {
      status: response.status,
      url: target.href,
      body: Buffer.concat(chunks, bytes).toString('utf8'),
      truncated,
    };
  }
  throw new Error('Web redirect limit reached.');
}

export async function searchWeb(
  endpoint: string,
  query: string,
  limit: number,
  policy: EgressPolicy,
  signal?: AbortSignal,
) {
  const target = new URL(endpoint);
  target.searchParams.set('q', query);
  target.searchParams.set('limit', String(limit));
  const response = await fetchWebText(target.href, policy, signal);
  if (response.status < 200 || response.status >= 300 || response.truncated) {
    throw new Error(`Web search failed: HTTP ${response.status}`);
  }
  const body: unknown = JSON.parse(response.body);
  const rows = body && typeof body === 'object' && 'results' in body ? body.results : undefined;
  if (!Array.isArray(rows)) throw new Error('Invalid Web search response.');
  const results: { url: string; title: string; snippet: string }[] = [];
  for (const row of rows.slice(0, limit)) {
    if (!row || typeof row.url !== 'string' || typeof row.title !== 'string') continue;
    let url: URL;
    try { url = new URL(row.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
    results.push({
      url: url.href.slice(0, 4096),
      title: row.title.slice(0, 500),
      snippet: typeof row.snippet === 'string' ? row.snippet.slice(0, 2000) : '',
    });
  }
  return { results };
}
