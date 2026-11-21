import { describe, expect, it, vi } from 'vitest';
import { StdioSdkMcpHost } from './stdio-sdk-transport.js';

describe('SDK-hosted MCP transport', () => {
  it('validates both request identities and accepts declared-server notifications', async () => {
    const write = vi.fn();
    const host = new StdioSdkMcpHost(write);
    const transport = host.transport('docs');
    const onmessage = vi.fn();
    transport.onmessage = onmessage;
    await transport.start();
    const pending = transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const envelope = write.mock.calls[0][0];
    const result = { jsonrpc: '2.0', id: 1, result: { tools: [] } };
    host.receive({ type: 'control_response', response: {
      request_id: 'unrelated', subtype: 'success', response: { mcp_response: result },
    } });
    expect(onmessage).not.toHaveBeenCalled();
    host.receive({ type: 'control_response', response: {
      request_id: envelope.request_id, subtype: 'success', response: { mcp_response: result },
    } });
    await pending;
    expect(onmessage).toHaveBeenCalledWith(result);
    expect(host.notify('unknown', { jsonrpc: '2.0', method: 'notifications/tools/list_changed' })).toBe(false);
    expect(host.notify('docs', { ...result })).toBe(false);
    expect(host.notify('docs', { jsonrpc: '2.0', method: 'notifications/tools/list_changed' })).toBe(true);
    await host.close();
  });

  it('settles pending requests when the host closes', async () => {
    const host = new StdioSdkMcpHost(vi.fn());
    const transport = host.transport('docs');
    const pending = expect(transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).rejects.toThrow('matching response');
    await host.close();
    await pending;
  });
});
