jest.mock('ai', () => ({ tool: jest.fn((definition: any) => definition), jsonSchema: jest.fn((schema: any) => schema) }));
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
