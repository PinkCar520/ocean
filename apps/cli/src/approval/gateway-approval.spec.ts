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
      .filter((request) => request.init?.method === 'POST')
      .map((request) => JSON.parse(String(request.init?.body)));
    expect(decisions).toEqual(['approved', 'approved']);
    expect(submitted).toHaveLength(2);
    expect(submitted.map((request) => request.args.path).sort()).toEqual(['a.txt', 'b.txt']);
  });
});
