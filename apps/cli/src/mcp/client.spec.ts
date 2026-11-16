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

  it('accepts Streamable HTTP and rejects unsafe remote URLs', () => {
    expect(normalizeMcpConfig({ mcpServers: { remote: { type: 'http', url: 'https://example.com/mcp' } } }).mcpServers[0]).toMatchObject({ type: 'http', url: 'https://example.com/mcp' });
    expect(() => normalizeMcpConfig({ mcpServers: { remote: { type: 'http', url: 'http://example.com/mcp' } } })).toThrow();
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

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

it('connects to a real stdio MCP server, discovers and calls its tool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-mcp-'));
  const manager = new McpClientManager({ workspacePath: process.cwd() } as any);
  try {
    const config = join(root, 'mcp.json');
    await writeFile(config, JSON.stringify({ mcpServers: { echo: { command: process.execPath, args: [resolve('src/mcp/fixtures/echo.mjs')], enabled: true } } }));
    await manager.loadConfig(config);
    await manager.connectAll();
    expect((await manager.getAllTools()).map((tool) => tool.name)).toEqual(['mcp__echo__echo']);
    await expect(manager.callTool('mcp__echo__echo', { text: 42 })).rejects.toThrow('Invalid MCP tool arguments');
    expect(await manager.callTool('mcp__echo__echo', { text: 'hello' })).toMatchObject({ content: [{ text: 'hello' }] });
    await expect(manager.callTool('mcp__unknown__echo', {})).rejects.toThrow('Unknown MCP tool');
  } finally { await manager.disconnectAll(); await rm(root, { recursive: true, force: true }); }
});

it('connects to a real Streamable HTTP MCP server and returns results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-mcp-http-'));
  const transports: StreamableHTTPServerTransport[] = [];
  const http = createServer(async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    transports.push(transport);
    const server = new Server({ name: 'echo-http', version: '1' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }));
    server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: 'http-ok' }] }));
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  const manager = new McpClientManager({ workspacePath: process.cwd() } as any);
  try {
    await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve); });
    const address = http.address() as { port: number };
    const config = join(root, 'mcp.json');
    await writeFile(config, JSON.stringify({ mcpServers: { remote: { type: 'http', url: `http://127.0.0.1:${address.port}/mcp`, enabled: true } } }));
    await manager.loadConfig(config);
    await manager.connectAll();
    expect(await manager.getAllTools()).toHaveLength(1);
    expect(await manager.callTool('mcp__remote__echo', {})).toMatchObject({ content: [{ text: 'http-ok' }] });
  } finally {
    await manager.disconnectAll();
    for (const transport of transports) await transport.close();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

it('does not retry calls with an unknown execution outcome', async () => {
  const manager = new McpClientManager({} as any);
  const callTool = vi.fn().mockRejectedValue(new Error('connection lost'));
  (manager as any).clients.set('test', { listTools: async () => ({ tools: [{ name: 'write', inputSchema: { type: 'object' } }] }), callTool });
  await manager.getAllTools();
  await expect(manager.callTool('mcp__test__write', {})).rejects.toThrow('outcome unknown');
  expect(callTool).toHaveBeenCalledTimes(1);
});

it('isolates manager routes and never dispatches an already cancelled call', async () => {
  const first = new McpClientManager({ userId: 'alice', workspacePath: '/alice' } as any);
  const second = new McpClientManager({ userId: 'bob', workspacePath: '/bob' } as any);
  const callTool = vi.fn();
  (first as any).clients.set('private', { listTools: async () => ({ tools: [{ name: 'write', inputSchema: { type: 'object' } }] }), callTool });
  await first.getAllTools();
  expect(await second.getAllTools()).toEqual([]);
  await expect(second.callTool('mcp__private__write', {})).rejects.toThrow('Unknown');
  const controller = new AbortController();
  controller.abort();
  await expect(first.callTool('mcp__private__write', {}, { signal: controller.signal })).rejects.toThrow();
  expect(callTool).not.toHaveBeenCalled();
});
