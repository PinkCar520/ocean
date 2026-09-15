import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { LifeService } from './life.service';

describe('LifeService (Phase 6 6e Life 投影)', () => {
  const space = {
    ensureLifeSpace: jest
      .fn()
      .mockResolvedValue({ id: 'life-u1', type: 'life' }),
    requireAccessibleSpace: jest
      .fn()
      .mockResolvedValue({ id: 'life-u1', type: 'life' }),
  };
  const spaceDeny = {
    ensureLifeSpace: jest
      .fn()
      .mockResolvedValue({ id: 'life-u1', type: 'life' }),
    requireAccessibleSpace: jest
      .fn()
      .mockRejectedValue(new ForbiddenException('denied')),
  };

  function create(overrides: any = {}) {
    const prisma = {
      lifeMemory: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'm1', content: 'note', tags: ['a'], spaceId: 'life-u1' },
          ]),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'm1', content: 'note', spaceId: 'life-u1' }),
        findFirst:
          overrides.memoryFindFirst ??
          jest.fn().mockResolvedValue({ id: 'm1' }),
        delete: jest.fn().mockResolvedValue({ id: 'm1' }),
      },
      contextGrant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'g1', toSpaceId: 'work' }]),
      },
      policySet: {
        findMany: jest.fn().mockResolvedValue([{ key: 'memory', rules: {} }]),
      },
      ...(overrides.prisma || {}),
    };
    const spaceSvc = overrides.space ?? space;
    return new LifeService(prisma as never, spaceSvc as never);
  }

  it('listMemories：限定本人 Life Space', async () => {
    const svc = create();
    const memories = await svc.listMemories('u1');
    expect(memories).toHaveLength(1);
    expect((svc as any).prisma.lifeMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: 'life-u1' } }),
    );
  });

  it('createMemory：落本人 Life Space + 默认 note', async () => {
    const svc = create();
    const memory = await svc.createMemory('u1', { content: '记住这个' });
    expect((svc as any).prisma.lifeMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ spaceId: 'life-u1', type: 'note' }),
      }),
    );
  });

  it('deleteMemory：跨 Space 记忆不可见（他人记忆删除 NotFound）', async () => {
    const svc = create({ memoryFindFirst: jest.fn().mockResolvedValue(null) });
    await expect(svc.deleteMemory('u1', 'other-mem')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('privacyOverview：返回本空间授权与策略', async () => {
    const svc = create();
    const ov = await svc.privacyOverview('u1');
    expect(ov.grants).toHaveLength(1);
    expect(ov.policies).toHaveLength(1);
  });

  it('他人无法访问本人 Life Space（requireAccessibleSpace 拒绝）', async () => {
    const svc = create({ space: spaceDeny });
    await expect(svc.listMemories('u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
