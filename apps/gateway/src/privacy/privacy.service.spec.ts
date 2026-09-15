import { PrivacyService } from './privacy.service';

describe('PrivacyService (Phase 7 7c data export / account deletion)', () => {
  const prisma = {
    user: { findUnique: jest.fn(), delete: jest.fn() },
    membership: { findMany: jest.fn(), deleteMany: jest.fn() },
    session: { findMany: jest.fn() },
    lifeMemory: { findMany: jest.fn(), deleteMany: jest.fn() },
    space: { delete: jest.fn().mockRejectedValue(new Error('not found')) },
    agentRun: { findMany: jest.fn() },
    auditLog: { findMany: jest.fn() },
    contextGrant: { findMany: jest.fn() },
  } as any;
  const svc = new PrivacyService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('exports all user data scopes', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', workId: 'w1' });
    prisma.membership.findMany.mockResolvedValue([{ spaceId: 'work' }]);
    prisma.session.findMany.mockResolvedValue([{ id: 's1' }]);
    prisma.lifeMemory.findMany.mockResolvedValue([{ id: 'm1' }]);
    prisma.agentRun.findMany.mockResolvedValue([{ id: 'r1' }]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.contextGrant.findMany.mockResolvedValue([]);

    const data = await svc.exportData('u1');
    expect(data.user?.id).toBe('u1');
    expect(data.sessions).toHaveLength(1);
    expect(data.lifeMemories).toHaveLength(1);
    expect(data.runs).toHaveLength(1);
    // Life 记忆按本人 life space 查询
    expect(prisma.lifeMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: 'life-u1' } }),
    );
  });

  it('rejects delete without confirmation', async () => {
    await expect(svc.deleteAccount('u1', 'NOPE')).rejects.toThrow();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes membership then user on confirm', async () => {
    await svc.deleteAccount('u1', 'DELETE');
    expect(prisma.lifeMemory.deleteMany).toHaveBeenCalledWith({
      where: { spaceId: 'life-u1' },
    });
    expect(prisma.space.delete).toHaveBeenCalledWith({
      where: { id: 'life-u1' },
    });
    expect(prisma.membership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });
});
