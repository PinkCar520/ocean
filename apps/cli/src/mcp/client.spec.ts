import { describe, expect, it, vi } from 'vitest';
import { McpClientManager, normalizeMcpConfig } from './client.js';

describe('CLI MCP manager', () => {
  it('accepts both MCP config layouts and defaults servers to untrusted', () => {
    const normalized = normalizeMcpConfig({
      mcpServers: {
        docs: { command: 'node', args: ['server.js'] },
        trusted: { command: 'node', enabled: true },
      },
    });
    expect(normalized.mcpServers).toMatchObject([
      { id: 'docs', name: 'docs', args: ['server.js'], enabled: undefined },
      { id: 'trusted', name: 'trusted', enabled: true },
    ]);
    expect(normalizeMcpConfig({ mcpServers: [
      { id: 'legacy', name: 'Legacy', command: 'node', args: [], enabled: true },
    ] }).mcpServers[0].name).toBe('Legacy');
    expect(() => normalizeMcpConfig({ mcpServers: { bad: { args: [] } } })).toThrow('stdio command');
  });

  it('discovers schemas and routes namespaced tool names with cancellation', async () => {
    const callTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const manager = new McpClientManager({} as any);
    (manager as any).clients.set('docs', {
      listTools: async () => ({
        tools: [{
          name: 'search__docs',
          description: 'Search docs',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        }],
      }),
      callTool,
    });

    const definitions = await manager.getAllTools();
    const signal = new AbortController().signal;
    await manager.callTool(definitions[0].name, { query: 'run' }, { signal });

    expect(definitions[0]).toMatchObject({
      name: 'mcp__docs__search__docs',
      inputSchema: { type: 'object' },
    });
    expect(callTool).toHaveBeenCalledWith(
      { name: 'search__docs', arguments: { query: 'run' } },
      undefined,
      { signal, timeout: 60_000 },
    );
  });
});
