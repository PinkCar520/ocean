import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SpaceService } from './space.service';

describe('SpaceService (Phase 5 数据边界)', () => {
  function create(overrides: {
    spaceFindUnique?: jest.Mock;
    membershipFindUnique?: jest.Mock;
  }) {
    const prisma = {
      space: {
        findUnique: overrides.spaceFindUnique ?? jest.fn().mockResolvedValue({ id: 'work', type: 'work' }),
      },
      membership: {
        findUnique: overrides.membershipFindUnique ?? jest.fn().mockResolvedValue({ id: 'm1' }),
      },
    };
    return new SpaceService(prisma as never);
  }

  it('默认 Work Space 常量与迁移种子对齐', () => {
    expect(SpaceService.DEFAULT_WORK_SPACE_ID).toBe('work');
  });

  it('requireSpace：存在时返回 Space 引用', async () => {
    const svc = create({});
    await expect(svc.requireSpace('work')).resolves.toEqual({ id: 'work', type: 'work' });
  });

  it('requireSpace：不存在时抛 NotFound', async () => {
    const svc = create({ spaceFindUnique: jest.fn().mockResolvedValue(null) });
    await expect(svc.requireSpace('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertAccess：有 Membership 时通过', async () => {
    const svc = create({});
    await expect(svc.assertAccess('u1', 'work')).resolves.toBeUndefined();
  });

  it('assertAccess：无 Membership 时抛 Forbidden（跨 Space 默认拒绝）', async () => {
    const svc = create({ membershipFindUnique: jest.fn().mockResolvedValue(null) });
    await expect(svc.assertAccess('u1', 'life')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requireAccessibleSpace：Space 不存在优先 NotFound', async () => {
    const svc = create({ spaceFindUnique: jest.fn().mockResolvedValue(null) });
    await expect(svc.requireAccessibleSpace('u1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requireAccessibleSpace：存在但无成员资格时抛 Forbidden', async () => {
    const svc = create({ membershipFindUnique: jest.fn().mockResolvedValue(null) });
    await expect(svc.requireAccessibleSpace('u1', 'work')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
