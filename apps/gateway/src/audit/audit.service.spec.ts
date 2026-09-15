import { AuditService } from './audit.service';

describe('AuditService (Phase 7 7b audit log)', () => {
  const logs: any[] = [];
  const prisma = {
    auditLog: {
      create: jest.fn(async (args: any) => {
        logs.push({ id: `a${logs.length + 1}`, ...args.data });
        return { id: `a${logs.length}` };
      }),
      findMany: jest.fn(async (args: any) =>
        logs.filter((l) => {
          const spaceOk = args.where.spaceId.in.includes(l.spaceId);
          const actorOk = l.actorUserId === args.where.actorUserId;
          return spaceOk && actorOk;
        }),
      ),
    },
    membership: { findMany: jest.fn() },
  } as any;

  const space = {
    requireAccessibleSpace: jest
      .fn()
      .mockResolvedValue({ id: 'work', type: 'work' }),
  } as any;
  const service = new AuditService(prisma, space);

  beforeEach(() => {
    logs.length = 0;
    jest.clearAllMocks();
  });

  it('records a tool execution with full provenance', async () => {
    await service.record({
      actorUserId: 'u1',
      action: 'tool.execute',
      spaceId: 'work',
      runId: 'r1',
      toolName: 'fs.write',
      inputJson: { path: '/tmp/x', content: 'hi' },
      authorization: 'approval',
    });
    expect(logs[0].actorUserId).toBe('u1');
    expect(logs[0].action).toBe('tool.execute');
    expect(logs[0].spaceId).toBe('work');
    expect(logs[0].inputJson).toEqual({ path: '/tmp/x', content: 'hi' });
    expect(logs[0].authorization).toBe('approval');
  });

  it('lists only the caller own actor and accessible spaces', async () => {
    prisma.membership.findMany.mockResolvedValue([
      { spaceId: 'work' },
      { spaceId: 'code' },
    ]);
    logs.push(
      { id: 'a1', actorUserId: 'u1', spaceId: 'work', action: 'tool.execute' },
      { id: 'a2', actorUserId: 'u2', spaceId: 'work', action: 'tool.execute' },
      {
        id: 'a3',
        actorUserId: 'u1',
        spaceId: 'life-other',
        action: 'tool.execute',
      },
    );
    const result = await service.list('u1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('enforces accessible space for explicit spaceId filter', async () => {
    space.requireAccessibleSpace.mockRejectedValueOnce(new Error('403'));
    await expect(service.list('u1', { spaceId: 'secret' })).rejects.toThrow(
      '403',
    );
    expect(space.requireAccessibleSpace).toHaveBeenCalledWith('u1', 'secret');
  });

  it('caps limit between 1 and 200', async () => {
    prisma.membership.findMany.mockResolvedValue([]);
    await service.list('u1', { limit: 9999 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
    await service.list('u1', { limit: -5 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });
});
