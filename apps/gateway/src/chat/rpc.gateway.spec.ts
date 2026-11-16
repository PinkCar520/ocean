import { RpcGateway } from './rpc.gateway';

describe('RpcGateway authentication and response binding', () => {
  const orchestrator = { syncPlan: jest.fn(), updateTaskProgress: jest.fn() };
  const apiKeys = { findUserByApiKey: jest.fn() };
  const jwt = { verify: jest.fn() };
  const prisma = { user: { findFirst: jest.fn() }, session: { findFirst: jest.fn() } };
  const socket = (id: string, query: any, token?: string) => ({
    id, connected: true, handshake: { query, auth: { token }, headers: {} }, data: {}, disconnect: jest.fn(), emit: jest.fn(),
  });
  let gateway: RpcGateway;
  beforeEach(() => {
    jest.resetAllMocks();
    gateway = new RpcGateway(orchestrator as never, apiKeys as never, jwt as never, prisma as never);
  });

  it('rejects anonymous, mismatched and foreign-session clients', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('bad token'); });
    const anonymous = socket('anonymous', { userId: 'alice' });
    await gateway.handleConnection(anonymous as never);
    expect(anonymous.disconnect).toHaveBeenCalled();
    apiKeys.findUserByApiKey.mockResolvedValue({ userId: 'db-a', workId: 'alice' });
    const impostor = socket('impostor', { userId: 'bob' }, 'ocean_sk_valid');
    await gateway.handleConnection(impostor as never);
    expect(impostor.disconnect).toHaveBeenCalled();
    prisma.session.findFirst.mockResolvedValue(null);
    const foreign = socket('web', { sessionId: 's-b' }, 'ocean_sk_valid');
    await gateway.handleConnection(foreign as never);
    expect(prisma.session.findFirst).toHaveBeenCalledWith({ where: { id: 's-b', userId: 'db-a' }, select: { id: true } });
    expect(foreign.disconnect).toHaveBeenCalled();
    expect(gateway.getOnlineUsers()).toEqual([]);
  });

  it('accepts valid JWT/cookie web sessions only after ownership verification', async () => {
    jwt.verify.mockReturnValue({ sub: 'db-a', workId: 'alice' });
    prisma.user.findFirst.mockResolvedValue({ id: 'db-a', workId: 'alice' });
    prisma.session.findFirst.mockResolvedValue({ id: 's-a' });
    const web = socket('web', { sessionId: 's-a' });
    (web.handshake.headers as any).cookie = 'ocean_session=signed.jwt.token';
    await gateway.handleConnection(web as never);
    expect(jwt.verify).toHaveBeenCalledWith('signed.jwt.token');
    expect(web.disconnect).not.toHaveBeenCalled();
  });

  it('derives the CLI identity from the API key without trusting a local username', async () => {
    apiKeys.findUserByApiKey.mockResolvedValue({ userId: 'db-a', workId: 'alice' });
    const cli = socket('cli-a', { clientType: 'cli' }, 'ocean_sk_valid');
    await gateway.handleConnection(cli as never);
    expect(gateway.getOnlineUsers()).toEqual(['alice']);
    expect(cli.emit).toHaveBeenCalledWith('rpc_identity', { workId: 'alice' });
  });

  it('accepts an RPC response only from the socket that received its request', async () => {
    apiKeys.findUserByApiKey.mockResolvedValue({ userId: 'db-a', workId: 'alice' });
    const cli = socket('cli-a', { userId: 'alice' }, 'ocean_sk_valid');
    await gateway.handleConnection(cli as never);
    const emit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit }) };
    const pending = gateway.sendToCli('alice', 'read_file', { path: 'a' });
    const request = emit.mock.calls[0][1];
    const attacker = socket('other', {}, 'ocean_sk_valid');
    (attacker.data as any).rpcPrincipal = { role: 'cli' };
    gateway.handleRpcResponse(attacker as never, { id: request.id, result: 'forged' } as never);
    gateway.handleRpcResponse(cli as never, { id: request.id, result: 'real' } as never);
    await expect(pending).resolves.toBe('real');
  });

  it('checks ownership of notebook sessions before dispatching to a CLI', async () => {
    apiKeys.findUserByApiKey.mockResolvedValue({ userId: 'db-a', workId: 'alice' });
    const cli = socket('cli-a', { clientType: 'cli' }, 'ocean_sk_valid');
    await gateway.handleConnection(cli as never);
    const emit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit }) };
    prisma.session.findFirst.mockResolvedValue(null);
    await expect(gateway.sendToCli('alice', 'notebook_edit', { sessionId: 'foreign' })).rejects.toThrow('session access denied');
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects pending requests on disconnect and blocks updates to foreign sessions', async () => {
    apiKeys.findUserByApiKey.mockResolvedValue({ userId: 'db-a', workId: 'alice' });
    const cli = socket('cli-a', { userId: 'alice' }, 'ocean_sk_valid');
    await gateway.handleConnection(cli as never);
    prisma.session.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 's-a' });
    await gateway.handlePlanSync(cli as never, { sessionId: 's-b', mode: 'plan', tasks: [] });
    expect(orchestrator.syncPlan).not.toHaveBeenCalled();
    await gateway.handlePlanSync(cli as never, { sessionId: 's-a', mode: 'plan', tasks: [] });
    expect(orchestrator.syncPlan).toHaveBeenCalledWith('s-a', []);
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    const pending = gateway.sendToCli('alice', 'read_file', {});
    gateway.handleDisconnect(cli as never);
    await expect(pending).rejects.toThrow('CLI disconnected');
  });
});
