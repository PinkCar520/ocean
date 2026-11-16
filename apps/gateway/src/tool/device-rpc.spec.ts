import { DeviceRpcBroker } from './device-rpc.broker';
import { DeviceRpcDispatcher } from '../chat/device-rpc.dispatcher';
import { createDeviceTools } from './device.tools';

describe('Run device RPC bridge', () => {
  function setup() {
    const rows = new Map<string, any>();
    let notifyCreated!: () => void;
    const created = new Promise<void>(resolve => { notifyCreated = resolve; });
    const prisma = {
      agentRun: { findUnique: jest.fn().mockResolvedValue({ userId: 'db-a', spaceId: 'work', status: 'running', metadata: { sessionId: 's-a' }, user: { workId: 'alice' } }) },
      session: { findFirst: jest.fn().mockResolvedValue({ id: 's-a' }) },
      outboxEvent: {
        upsert: jest.fn(async ({ where, create }: any) => {
          if (!rows.has(where.id)) { rows.set(where.id, { ...create, status: 'pending', createdAt: new Date() }); notifyCreated(); }
          return { ...rows.get(where.id) };
        }),
        findUnique: jest.fn(async ({ where }: any) => rows.get(where.id) ?? null),
        findMany: jest.fn(async ({ where }: any) => [...rows.values()].filter(row => row.topic === where.topic && row.status === where.status && row.payload.workId === where.payload.equals)),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = rows.get(where.id);
          if (!row || row.status !== where.status || (where.lockedBy && row.lockedBy !== where.lockedBy)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
    };
    const rpc = { getOnlineUsers: jest.fn().mockReturnValue(['alice']), sendToCli: jest.fn() };
    const broker = new DeviceRpcBroker(prisma as never);
    const dispatcher = new DeviceRpcDispatcher(prisma as never, rpc as never);
    return { rows, created, prisma, rpc, broker, dispatcher };
  }

  it('persists, dispatches once and returns the same result on worker redelivery', async () => {
    const { created, rpc, broker, dispatcher } = setup();
    rpc.sendToCli.mockResolvedValue({ kind: 'notebook', parts: [{ type: 'text', text: 'hello' }] });
    const ctx = { runId: 'r-a', userId: 'db-a', toolCallId: 'call-a' };
    const pending = broker.request('notebook_read', { path: 'n.ipynb' }, ctx);
    await created;
    await dispatcher.poll();
    expect(await pending).toMatchObject({ kind: 'notebook' });
    expect(rpc.sendToCli).toHaveBeenCalledWith('alice', 'notebook_read', { path: 'n.ipynb', sessionId: 's-a' });
    expect(await broker.request('notebook_read', { path: 'n.ipynb' }, ctx)).toMatchObject({ kind: 'notebook' });
    expect(rpc.sendToCli).toHaveBeenCalledTimes(1);
    await expect(broker.request('notebook_read', { path: 'other.ipynb' }, ctx)).rejects.toThrow('identity conflicts');
  });

  it('dispatches a validated local file read with its range and owned session', async () => {
    const { created, rpc, broker, dispatcher } = setup();
    rpc.sendToCli.mockResolvedValue({ content: 'second', offset: 1 });
    const tool = createDeviceTools(broker).find(item => item.name === 'local_file_read')!;
    await expect(tool.execute({ path: 'source.txt', limit: 1001 }, { runId: 'r-a', userId: 'db-a', toolCallId: 'c' })).rejects.toThrow('Invalid file read');
    const pending = tool.execute({ path: 'source.txt', offset: 1, limit: 1 }, { runId: 'r-a', userId: 'db-a', toolCallId: 'c' });
    await created;
    await dispatcher.poll();
    expect(await pending).toEqual({ content: 'second', offset: 1 });
    expect(rpc.sendToCli).toHaveBeenCalledWith('alice', 'file_read', { path: 'source.txt', offset: 1, limit: 1, sessionId: 's-a' });
  });

  it('keeps an uncertain write terminal and never redispatches it', async () => {
    const { created, rows, rpc, broker, dispatcher } = setup();
    rpc.sendToCli.mockRejectedValue(new Error('connection lost'));
    const ctx = { runId: 'r-a', userId: 'db-a', toolCallId: 'call-b' };
    const pending = broker.request('notebook_edit', { path: 'n.ipynb', mode: 'delete', cell_id: 'a' }, ctx);
    await created;
    await dispatcher.poll();
    await expect(pending).rejects.toThrow('result is unknown');
    expect([...rows.values()][0].status).toBe('uncertain');
    await dispatcher.poll();
    await expect(broker.request('notebook_edit', { path: 'n.ipynb', mode: 'delete', cell_id: 'a' }, ctx)).rejects.toThrow('result is unknown');
    expect(rpc.sendToCli).toHaveBeenCalledTimes(1);
  });

  it('cancels pending requests and preserves uncertainty after dispatch', async () => {
    const queued = setup();
    const ctx = { runId: 'r-a', userId: 'db-a', toolCallId: 'cancelled' };
    const pending = queued.broker.request('notebook_read', { path: 'n.ipynb' }, ctx);
    await queued.created;
    queued.prisma.agentRun.findUnique.mockResolvedValue({ status: 'cancelled' });
    await expect(pending).rejects.toThrow('Run cancelled');
    await queued.dispatcher.poll();
    expect([...queued.rows.values()][0].status).toBe('cancelled');
    expect(queued.rpc.sendToCli).not.toHaveBeenCalled();

    const active = setup();
    let finish!: (value: unknown) => void;
    let dispatched!: () => void;
    const started = new Promise<void>(resolve => { dispatched = resolve; });
    active.rpc.sendToCli.mockImplementation(() => { dispatched(); return new Promise(resolve => { finish = resolve; }); });
    const write = active.broker.request('notebook_edit', { path: 'n.ipynb', mode: 'delete', cell_id: 'a' }, { ...ctx, toolCallId: 'in-flight' });
    await active.created;
    const delivery = active.dispatcher.poll();
    await started;
    active.prisma.agentRun.findUnique.mockResolvedValue({ status: 'cancelled' });
    await expect(write).rejects.toThrow('Run cancelled');
    finish({ ok: true });
    await delivery;
    expect([...active.rows.values()][0].status).toBe('uncertain');
  });

  it('requires owned sessions and gates notebook edits before dispatch', async () => {
    const { prisma, broker } = setup();
    prisma.session.findFirst.mockResolvedValue(null);
    const tools = createDeviceTools(broker);
    expect(tools.find(tool => tool.name === 'local_notebook_edit')?.requiresApproval).toBe(true);
    await expect(tools[0].execute({ path: 'n.ipynb' }, { runId: 'r-a', userId: 'db-a', toolCallId: 'c' })).rejects.toThrow('ownership');
    await expect(tools[1].execute({ path: 'n.ipynb', mode: 'insert', new_source: 'x' }, { runId: 'r-a', userId: 'db-a', toolCallId: 'c' })).rejects.toThrow('cell_type');
    expect(prisma.outboxEvent.upsert).not.toHaveBeenCalled();
  });

  it('does not dispatch an expired request after a worker restart', async () => {
    const { created, rows, rpc, broker, dispatcher } = setup();
    const pending = broker.request('notebook_read', { path: 'n.ipynb' }, { runId: 'r-a', userId: 'db-a', toolCallId: 'expired' });
    await created;
    [...rows.values()][0].payload.expiresAt = '2000-01-01T00:00:00.000Z';
    await dispatcher.poll();
    await expect(pending).rejects.toThrow('expired before dispatch');
    expect(rpc.sendToCli).not.toHaveBeenCalled();
  });
});
