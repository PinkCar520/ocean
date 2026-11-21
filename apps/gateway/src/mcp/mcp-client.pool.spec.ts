jest.mock('ai', () => ({ tool: jest.fn((definition: any) => definition), jsonSchema: jest.fn((schema: any) => schema) }));
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MCPClientPool, mcpScopeKey, mcpUserHome, readMCPUserEnv } from './mcp-client.pool';
import { createMcpResourceTools } from '../tool/mcp-resource.tools';
import { MCPClientManager } from './mcp-client.manager';

class FakeManager {
  readonly initialize = jest.fn(async () => undefined);
  readonly getAITools = jest.fn(async () => ({ tool: this.id }));
  readonly dispose = jest.fn(async () => undefined);
  constructor(readonly id: string) {}
}

class TestPool extends MCPClientPool {
  readonly managers: FakeManager[] = [];
  constructor(private readonly loader: any) {
    super(loader, {} as any, {} as any, {} as any);
  }
  protected createManager(): MCPClientManager {
    const manager = new FakeManager(String(this.managers.length));
    this.managers.push(manager);
    return manager as any;
  }
}

describe('MCPClientPool tenant isolation', () => {
  it('creates one isolated manager per user/workspace and reuses it', async () => {
    const loader = { loadConfig: jest.fn(() => ({ mcpServers: [] })) };
    const pool = new TestPool(loader);
    const scope = { userId: 'user-a', workspacePath: '/workspace/one' };
    expect(await pool.getAITools(scope)).toEqual({ tool: '0' });
    expect(await pool.getAITools(scope)).toEqual({ tool: '0' });
    expect(pool.managers).toHaveLength(1);
    expect(loader.loadConfig).toHaveBeenCalledWith('/workspace/one', {
      userHome: mcpUserHome(scope),
      includeLocal: false,
      env: {},
      envFallback: false,
    });

    expect(await pool.getAITools({ userId: 'user-b', workspacePath: '/workspace/one' })).toEqual({ tool: '1' });
    expect(await pool.getAITools({ userId: 'user-a', workspacePath: '/workspace/two' })).toEqual({ tool: '2' });
    expect(pool.managers).toHaveLength(3);
    const calls = loader.loadConfig.mock.calls as any[];
    expect(calls[1][1].userHome).not.toBe(calls[0][1].userHome);
  });

  it('deduplicates concurrent initialization and disposes every tenant', async () => {
    const loader = { loadConfig: jest.fn(() => ({ mcpServers: [] })) };
    const pool = new TestPool(loader);
    const [first, second] = await Promise.all([
      pool.getAITools({ userId: 'same' }),
      pool.getAITools({ userId: 'same' }),
    ]);
    expect(first).toEqual({ tool: '0' });
    expect(second).toEqual({ tool: '0' });
    expect(pool.managers).toHaveLength(1);
    await pool.getAITools({ userId: 'other' });
    await pool.onModuleDestroy();
    expect(pool.managers.every((manager) => manager.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('evicts the least-recently-used scope when the configured cap is reached', async () => {
    const previous = process.env.MCP_SCOPE_LIMIT;
    process.env.MCP_SCOPE_LIMIT = '1';
    try {
      const loader = { loadConfig: jest.fn(() => ({ mcpServers: [] })) };
      const pool = new TestPool(loader);
      await pool.getAITools({ userId: 'first' });
      await pool.getAITools({ userId: 'second' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(pool.managers[0].dispose).toHaveBeenCalledTimes(1);
      expect(pool.managers[1].dispose).not.toHaveBeenCalled();
      await pool.onModuleDestroy();
    } finally {
      if (previous === undefined) delete process.env.MCP_SCOPE_LIMIT;
      else process.env.MCP_SCOPE_LIMIT = previous;
    }
  });

  it('reads a private per-user environment overlay and rejects invalid entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-mcp-env-'));
    try {
      const home = join(root, 'home');
      await mkdir(join(home, '.ocean'), { recursive: true });
      const file = join(home, '.ocean', 'mcp.env.json');
      await writeFile(file, JSON.stringify({ ZENTAO_API_TOKEN: 'scoped-token' }), { mode: 0o600 });
      await expect(readMCPUserEnv(home)).resolves.toEqual({ ZENTAO_API_TOKEN: 'scoped-token' });
      await writeFile(file, JSON.stringify({ 'bad-key': 'x' }), { mode: 0o600 });
      await expect(readMCPUserEnv(home)).rejects.toThrow('environment');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('replaces only the affected tenant manager when its environment file changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-mcp-reload-'));
    const previous = process.env.OCEAN_MCP_USER_ROOT;
    process.env.OCEAN_MCP_USER_ROOT = root;
    const pool = new TestPool({ loadConfig: jest.fn(() => ({ mcpServers: [] })) });
    try {
      const scope = { userId: 'changing' };
      const home = mcpUserHome(scope);
      await mkdir(join(home, '.ocean'), { recursive: true });
      const file = join(home, '.ocean', 'mcp.env.json');
      await writeFile(file, JSON.stringify({ TOKEN: 'first' }), { mode: 0o600 });
      expect(await pool.getAITools(scope)).toEqual({ tool: '0' });
      await pool.getAITools({ userId: 'unchanged' });
      await writeFile(file, JSON.stringify({ TOKEN: 'second' }));
      const refreshed = await Promise.all([pool.getAITools(scope), pool.getAITools(scope)]);
      expect(refreshed).toEqual([{ tool: '2' }, { tool: '2' }]);
      expect(pool.managers[0].dispose).toHaveBeenCalledTimes(1);
      expect(await pool.getAITools({ userId: 'unchanged' })).toEqual({ tool: '1' });
      await writeFile(file, '{broken');
      await expect(pool.getAITools(scope)).rejects.toThrow();
    } finally {
      await pool.onModuleDestroy();
      if (previous === undefined) delete process.env.OCEAN_MCP_USER_ROOT; else process.env.OCEAN_MCP_USER_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects missing principals and separates users sharing a workspace', () => {
    expect(() => mcpScopeKey({ userId: '' })).toThrow('principal');
    expect(() => mcpScopeKey({ userId: 'u', workspacePath: '/a' })).not.toBe(mcpScopeKey({ userId: 'v', workspacePath: '/a' }));
    expect(mcpUserHome({ userId: 'u' }, '/root')).toMatch(/^\/root\/[a-f0-9]{32}$/);
  });
});


it('routes paginated resource templates through an authenticated Gateway tool and isolates users', async () => {
  const owner = { userId: 'resource-template-fixture-owner' };
  const loader = {
    loadConfig: (_workspace: unknown, options: { userHome: string }) => ({
      mcpServers: options.userHome === mcpUserHome(owner) ? [{
        id: 'docs', name: 'Documents', enabled: true,
        command: process.execPath,
        args: [resolve('../cli/src/mcp/fixtures/resources.mjs')],
      }] : [],
    }),
  };
  const pool = new MCPClientPool(loader as any, { get: () => undefined } as any, {} as any, {} as any);
  const tools = createMcpResourceTools(pool);
  const list = tools.find(tool => tool.name === 'mcp_list_resource_templates')!;
  const read = tools.find(tool => tool.name === 'mcp_read_resource')!;
  const ctx = { ...owner, runId: 'fixture-run' };
  try {
    expect(list.permissionServer?.({ server: 'docs' })).toBe('docs');
    await expect(list.execute({ server: 'docs' })).rejects.toThrow('Missing authenticated MCP context');
    await expect(list.execute({ server: 'docs' }, ctx)).resolves.toMatchObject({
      nextCursor: 'next', resourceTemplates: [{ uriTemplate: 'fixture://docs/{id}' }],
    });
    await expect(list.execute({ server: 'docs', cursor: 'next' }, ctx)).resolves.toMatchObject({
      resourceTemplates: [{ uriTemplate: 'fixture://archive/{id}' }],
    });
    await expect(read.execute({ server: 'docs', uri: 'fixture://docs/42' }, ctx)).resolves.toMatchObject({
      contents: [{ uri: 'fixture://docs/42', text: 'Fixture document' }],
    });
    await expect(list.execute({ server: 'docs' }, { ...ctx, userId: 'another-user' })).rejects.toThrow('does not expose resources');
  } finally {
    await pool.onModuleDestroy();
  }
});
