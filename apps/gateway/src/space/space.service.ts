import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface SpaceRef {
  id: string;
  type: string;
}

/**
 * SpaceService —— Phase 5 Space 数据边界（ADR-001）的统一入口。
 *
 * - 默认 Work Space 由迁移种子固定（id='work'，客户端默认引用）。
 * - requireSpace：校验 Space 存在，防止 Run/会话创建引用不存在的空间。
 * - assertAccess：用户必须拥有该 Space 的 Membership 才能访问（Life 亦同）。
 */
@Injectable()
export class SpaceService {
  /** 默认 Work Space（与迁移种子 20260915000005_add_space_boundary 对齐）。 */
  static readonly DEFAULT_WORK_SPACE_ID = 'work';

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  get defaultWorkSpaceId(): string {
    return SpaceService.DEFAULT_WORK_SPACE_ID;
  }

  /** 校验 Space 存在并返回引用（不存在 → 404）。 */
  async requireSpace(spaceId: string): Promise<SpaceRef> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { id: true, type: true },
    });
    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }
    return space;
  }

  /** 校验用户拥有该 Space 的成员资格（无成员资格 → 403）。 */
  async assertAccess(userId: string, spaceId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException(`User ${userId} has no access to space ${spaceId}`);
    }
  }

  /** 校验 Space 存在且用户可访问；返回 SpaceRef。 */
  async requireAccessibleSpace(userId: string, spaceId: string): Promise<SpaceRef> {
    const ref = await this.requireSpace(spaceId);
    await this.assertAccess(userId, spaceId);
    return ref;
  }

  /** Life Space id：每用户一个，人工可读。 */
  static lifeSpaceIdFor(userId: string): string {
    return `life-${userId}`;
  }

  /**
   * 幂等创建用户的 Life Space（首次进入 Life 场景时调用）：
   * 存在则返回；不存在则创建 space + 本人 owner Membership。
   */
  async ensureLifeSpace(userId: string): Promise<SpaceRef> {
    const id = SpaceService.lifeSpaceIdFor(userId);
    const existing = await this.prisma.space.findUnique({ where: { id }, select: { id: true, type: true } });
    if (existing) {
      await this.ensureMembership(userId, id, 'owner');
      return existing;
    }
    await this.prisma.space.create({
      data: { id, slug: id, name: '生活空间', type: 'life', description: '个人 Life Space（默认仅本人）' },
    });
    await this.prisma.membership.create({
      data: { spaceId: id, userId, role: 'owner' },
    });
    return { id, type: 'life' };
  }

  /** 用户可见的 Space 列表（有 Membership 的 Space）。 */
  async listSpaces(userId: string) {
    return this.prisma.space.findMany({
      where: { memberships: { some: { userId } } },
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        icon: true,
        memberships: { where: { userId }, select: { role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async ensureMembership(userId: string, spaceId: string, role: string) {
    const existing = await this.prisma.membership.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { id: true },
    });
    if (!existing) {
      await this.prisma.membership.create({ data: { spaceId, userId, role } });
    }
  }
}
