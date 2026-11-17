import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MCPConfigLoader } from './mcp-config.loader';

describe('MCPConfigLoader tenant scoping', () => {
  const previousGatewayRoot = process.env.GATEWAY_ROOT;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ocean-mcp-config-'));
    process.env.GATEWAY_ROOT = join(root, 'gateway-empty');
    await mkdir(process.env.GATEWAY_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (previousGatewayRoot === undefined) delete process.env.GATEWAY_ROOT;
    else process.env.GATEWAY_ROOT = previousGatewayRoot;
    await rm(root, { recursive: true, force: true });
  });

  it('lets project config override the user layer for the same server id', async () => {
    const workspace = join(root, 'workspace-priority');
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, '.mcp.json'), JSON.stringify({ mcpServers: [{ id: 'shared', name: 'Project', command: 'node', args: [], enabled: true }] }));
    const home = join(root, 'home-priority');
    await mkdir(join(home, '.ocean'), { recursive: true });
    await writeFile(join(home, '.ocean', 'mcp.json'), JSON.stringify({ mcpServers: [{ id: 'shared', name: 'User', command: 'node', args: [], enabled: true }] }));
    const config = new MCPConfigLoader().loadConfig(workspace, { userHome: home, includeLocal: false });
    expect(config.mcpServers.find((server) => server.id === 'shared')?.name).toBe('Project');
  });

  it('expands variables from the scoped environment without process fallback', async () => {
    const workspace = join(root, 'workspace-env');
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, '.mcp.json'), JSON.stringify({
      mcpServers: [{ id: 'env', name: 'Env', command: 'node', args: ['${GATEWAY_ROOT}'], env: { TOKEN: '${TOKEN}', FALLBACK: '${PROCESS_ONLY:-default}' }, enabled: true }],
    }));
    const loader = new MCPConfigLoader();
    const scoped = loader.loadConfig(workspace, { includeLocal: false, env: { TOKEN: 'scoped-token', GATEWAY_ROOT: '/scoped' }, envFallback: false });
    expect(scoped.mcpServers[0]).toMatchObject({ args: ['/scoped'], env: { TOKEN: 'scoped-token', FALLBACK: 'default' } });
    const noFallback = loader.loadConfig(workspace, { includeLocal: false, env: {}, envFallback: false });
    expect(noFallback.mcpServers[0]).toMatchObject({ env: { TOKEN: '' } });
  });

  it('loads a separate user config home and keeps project config shared', async () => {
    const workspace = join(root, 'workspace');
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, '.mcp.json'), JSON.stringify({ mcpServers: [{ id: 'shared', name: 'Shared', command: 'node', args: [], enabled: true }] }));
    for (const [name, serverId] of [['home-a', 'only-a'], ['home-b', 'only-b']]) {
      const home = join(root, name);
      await mkdir(join(home, '.ocean'), { recursive: true });
      await writeFile(join(home, '.ocean', 'mcp.json'), JSON.stringify({ mcpServers: [{ id: serverId, name: serverId, command: 'node', args: [], enabled: true }] }));
    }
    const loader = new MCPConfigLoader();
    const a = loader.loadConfig(workspace, { userHome: join(root, 'home-a'), includeLocal: false });
    const b = loader.loadConfig(workspace, { userHome: join(root, 'home-b'), includeLocal: false });
    expect(a.mcpServers.map((server) => server.id).sort()).toEqual(['only-a', 'shared']);
    expect(b.mcpServers.map((server) => server.id).sort()).toEqual(['only-b', 'shared']);
    expect(a.mcpServers.some((server) => server.id === 'only-b')).toBe(false);
    expect(b.mcpServers.some((server) => server.id === 'only-a')).toBe(false);
  });
});
