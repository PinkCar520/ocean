import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGatewayApprovalHandler } from './gateway-approval.js';

describe('Gateway CLI approval binding', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a separate approval for concurrent calls with different inputs', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let id = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url);
      requests.push({ url: requestUrl, init });
      if (init?.method === 'POST') {
        id += 1;
        return new Response(JSON.stringify({ id: `approval-${id}` }), { status: 201 });
      }
      return new Response(JSON.stringify({ status: 'approved' }), { status: 200 });
    }));

    const approve = createGatewayApprovalHandler({
      gatewayUrl: 'http://gateway.test',
      apiKey: 'test-key',
      sessionId: 'session-1',
      pollIntervalMs: 0,
    });
    const decisions = await Promise.all([
      approve('file_write', { path: 'a.txt', content: 'first' }),
      approve('file_write', { path: 'b.txt', content: 'second' }),
    ]);

    const submitted = requests
      .filter((request) => request.url.endsWith('/api/approvals') && request.init?.method === 'POST')
      .map((request) => JSON.parse(String(request.init?.body)));
    expect(decisions).toEqual(['approved', 'approved']);
    expect(submitted).toHaveLength(2);
    expect(submitted.map((request) => request.args.path).sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('reuses an exact session grant without creating another approval', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith('/session-grant/lookup')) {
        return new Response(JSON.stringify({ granted: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'should-not-be-used' }), { status: 201 });
    }));
    const approve = createGatewayApprovalHandler({
      gatewayUrl: 'http://gateway.test',
      apiKey: 'test-key',
      sessionId: 'session-1',
      pollIntervalMs: 0,
    });
    await expect(approve('file_write', { path: 'a.txt', content: 'first' })).resolves.toBe('approved');
    expect(requests.some((request) => request.url.endsWith('/api/approvals') && request.init?.method === 'POST')).toBe(false);
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
      sessionId: 'session-1', toolName: 'file_write', args: { path: 'a.txt', content: 'first' },
    });
  });
  it('pins the policy fingerprint and refuses approval after local policy changes', async () => {
    let version = 'policy-v1';
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (init?.body) bodies.push(JSON.parse(init.body));
      if (String(url).endsWith('/lookup')) return new Response('{"granted":false}');
      if (init?.method === 'POST') return new Response('{"id":"bound"}');
      version = 'policy-v2'; return new Response('{"status":"approved"}');
    }));
    const handler = createGatewayApprovalHandler({ gatewayUrl: 'http://gateway.test', apiKey: 'key', sessionId: 's', pollIntervalMs: 0, policyVersion: () => version });
    expect(await handler('file_write', {})).toBe('rejected');
    expect(bodies.every(body => body.policyVersion === 'policy-v1')).toBe(true);
  });

  it('returns cancelled when the AbortSignal fires during polling', async () => {
    const controller = new AbortController();
    let pollCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      if (String(url).endsWith('/lookup')) return new Response('{"granted":false}');
      if (init?.method === 'POST') return new Response('{"id":"ab"}');
      pollCount += 1;
      // Abort on the first poll to simulate Ctrl+C.
      if (pollCount === 1) controller.abort();
      return new Response('{"status":"pending"}');
    }));
    const handler = createGatewayApprovalHandler({
      gatewayUrl: 'http://gateway.test', apiKey: 'key', sessionId: 's', pollIntervalMs: 0,
    });
    expect(await handler('file_write', {}, { signal: controller.signal })).toBe('cancelled');
  });

  it('recovers from a transient gateway failure and still approves', async () => {
    let pollCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/lookup')) return new Response('{"granted":false}');
      if (init?.method === 'POST') return new Response('{"id":"rec"}');
      pollCount += 1;
      if (pollCount === 1) throw new Error('gateway unavailable');
      return new Response('{"status":"approved"}');
    }));
    const handler = createGatewayApprovalHandler({
      gatewayUrl: 'http://gateway.test', apiKey: 'key', sessionId: 's', pollIntervalMs: 0,
    });
    expect(await handler('file_write', {})).toBe('approved');
    expect(pollCount).toBeGreaterThan(1);
  });

  it('fails closed (rejected) when the gateway cannot be reached at creation time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const handler = createGatewayApprovalHandler({
      gatewayUrl: 'http://gateway.test', apiKey: 'key', sessionId: 's', pollIntervalMs: 0,
    });
    expect(await handler('file_write', {})).toBe('rejected');
  });

});
