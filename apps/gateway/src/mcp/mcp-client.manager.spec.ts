jest.mock('ai', () => ({ tool: jest.fn((definition: any) => definition), jsonSchema: jest.fn((schema: any) => schema) }));
import { resolve } from 'node:path';
import { MCPClientManager, mcpToolName } from './mcp-client.manager';

class TestManager extends MCPClientManager {
  readonly connected: string[] = [];
  constructor() { super({ get: () => undefined } as any, {} as any, {} as any); }
  async connectServer(config: any): Promise<void> { this.connected.push(config.id); }
}

describe('MCP tool naming', () => {
  it('uses the permission policy MCP namespace', () => {
    expect(mcpToolName('zentao', 'getBugInfo')).toBe('mcp__zentao:getBugInfo');
  });
});

describe('MCPClientManager scoped initialization', () => {
  it('connects enabled servers once and ignores later initialize calls', async () => {
    const manager = new TestManager();
    await manager.initialize({ mcpServers: [
      { id: 'enabled', name: 'Enabled', command: 'node', args: [], enabled: true },
      { id: 'disabled', name: 'Disabled', command: 'node', args: [], enabled: false },
    ] } as any);
    expect(manager.connected).toEqual(['enabled']);
    await manager.initialize({ mcpServers: [{ id: 'second', name: 'Second', command: 'node', args: [], enabled: true }] } as any);
    expect(manager.connected).toEqual(['enabled']);
    await manager.dispose();
  });
});


it('aggregates tools without enumerating tools on resource-only servers', async () => {
  const manager = new TestManager();
  const listTools = jest.fn();
  const listResources = jest.fn().mockResolvedValue({ resources: [{ uri: 'fixture://docs', name: 'docs' }] });
  const clients = (manager as any).clients;
  clients.set('docs', { client: { getServerCapabilities: () => ({ resources: {} }), listTools, listResources } });
  clients.set('echo', { client: {
    getServerCapabilities: () => ({ tools: {} }),
    listTools: jest.fn().mockResolvedValue({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }),
  } });

  expect(Object.keys(await manager.getAITools())).toEqual(['mcp__echo:echo']);
  expect(listTools).not.toHaveBeenCalled();
  expect(await manager.listServerResources('docs')).toMatchObject({ resources: [{ uri: 'fixture://docs' }] });
});


it('calls a Gateway MCP tool discovered beyond the first eight catalog pages', async () => {
  const manager = new TestManager();
  const listTools = jest.fn(async ({ cursor }: { cursor?: string }) => {
    const page = Number(cursor ?? 1);
    return page === 9
      ? { tools: [{ name: 'target', inputSchema: { type: 'object' } }] }
      : { tools: [], nextCursor: String(page + 1) };
  });
  const callTool = jest.fn().mockResolvedValue({ content: [] });
  (manager as any).clients.set('docs', { client: { getServerCapabilities: () => ({ tools: {} }), listTools, callTool } });
  await expect(manager.callServerTool('docs', 'target', {})).resolves.toEqual({ content: [] });
  expect(listTools).toHaveBeenCalledTimes(9);
  expect(callTool).toHaveBeenCalledTimes(1);
});

it('retries catalog discovery after a transient server failure', async () => {
  const manager = new TestManager();
  const listTools = jest.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] });
  (manager as any).clients.set('docs', { client: { getServerCapabilities: () => ({ tools: {} }), listTools } });
  expect(await manager.getAITools()).toEqual({});
  expect(Object.keys(await manager.getAITools())).toEqual(['mcp__docs:echo']);
  await manager.getAITools();
  expect(listTools).toHaveBeenCalledTimes(2);
});


it('refreshes the Gateway catalog after an actual stdio tools/list_changed notification', async () => {
  const manager = new MCPClientManager({ get: () => undefined } as any, {} as any, {} as any);
  try {
    await manager.initialize({ mcpServers: [{
      id: 'echo', name: 'Echo', enabled: true, command: process.execPath,
      args: [resolve('../cli/src/mcp/fixtures/echo.mjs'), '--changes-catalog'],
    }] });
    expect(Object.keys(await manager.getAITools())).toEqual(['mcp__echo:echo']);
    await manager.callServerTool('echo', 'echo', { text: 'refresh catalog' });
    expect(Object.keys(await manager.getAITools())).toEqual(['mcp__echo:echo_updated']);
  } finally {
    await manager.dispose();
  }
});
