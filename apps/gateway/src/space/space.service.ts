import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';

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

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Optional() private readonly audit?: AuditService,
  ) {}

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
      throw new ForbiddenException(
        `User ${userId} has no access to space ${spaceId}`,
      );
    }
  }

  /** 校验 Space 存在且用户可访问；返回 SpaceRef。 */
  async requireAccessibleSpace(
    userId: string,
    spaceId: string,
  ): Promise<SpaceRef> {
    const ref = await this.requireSpace(spaceId);
    await this.assertAccess(userId, spaceId);
    return ref;
  }

  /**
   * 列出当前用户可访问空间相关的授权（from 或 to 任一涉及本人空间）。
   * Phase 6 6f：跨 Space 授权。
   */
  async listGrants(userId: string) {
    const spaces = await this.prisma.membership.findMany({
      where: { userId },
      select: { spaceId: true },
    });
    const ids = spaces.map((m) => m.spaceId);
    return this.prisma.contextGrant.findMany({
      where: {
        revokedAt: null,
        OR: [{ fromSpaceId: { in: ids } }, { toSpaceId: { in: ids } }],
      },
      include: {
        fromSpace: { select: { id: true, name: true, slug: true } },
        toSpace: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 创建跨 Space 授权（幂等：同 from/to 未撤销已有则复用并刷新）。
   * 校验：fromSpace 必须是调用者可访问的空间（不能授权不属于自己的数据）；
   * toSpace 必须存在且非 fromSpace。
   */
  async createGrant(
    userId: string,
    dto: {
      fromSpaceId?: string;
      toSpaceId: string;
      purpose?: string;
      scope?: unknown;
      expiresAt?: string;
    },
  ) {
    // fromSpaceId 缺省 = 本人 Life Space（Life 授权 UI 语义）
    const fromSpaceId =
      dto.fromSpaceId ?? (await this.ensureLifeSpace(userId)).id;
    if (fromSpaceId === dto.toSpaceId) {
      throw new ForbiddenException('fromSpace and toSpace must differ');
    }
    await this.requireAccessibleSpace(userId, fromSpaceId);
    await this.requireSpace(dto.toSpaceId); // 404 若不存在
    const existing = await this.prisma.contextGrant.findFirst({
      where: {
        fromSpaceId: dto.fromSpaceId,
        toSpaceId: dto.toSpaceId,
        revokedAt: null,
      },
      select: { id: true },
    });
    const data = {
      fromSpaceId,
      toSpaceId: dto.toSpaceId,
      purpose: dto.purpose ?? null,
      scope: dto.scope ? (dto.scope as Prisma.InputJsonValue) : undefined,
      grantedByUserId: userId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    };
    if (existing) {
      return this.prisma.contextGrant.update({
        where: { id: existing.id },
        data: {
          purpose: data.purpose,
          scope: data.scope ?? undefined,
          expiresAt: data.expiresAt,
          revokedAt: null,
        },
      });
    }
    const created = await this.prisma.contextGrant.create({ data });
    await this.audit?.record({
      actorUserId: userId,
      action: 'grant.created',
      spaceId: fromSpaceId,
      inputJson: { toSpaceId: dto.toSpaceId, purpose: data.purpose },
      authorization: `grant:${created.id}`,
    });
    return created;
  }

  /** 撤销授权（软删：revokedAt=now）。 */
  async revokeGrant(userId: string, grantId: string) {
    const grant = await this.prisma.contextGrant.findUnique({
      where: { id: grantId },
      select: { id: true, fromSpaceId: true },
    });
    if (!grant) throw new NotFoundException(`Grant ${grantId} not found`);
    // 仅授权方空间成员可撤销
    await this.requireAccessibleSpace(userId, grant.fromSpaceId);
    const revoked = await this.prisma.contextGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });
    await this.audit?.record({
      actorUserId: userId,
      action: 'grant.revoked',
      spaceId: grant.fromSpaceId,
      inputJson: { grantId },
      authorization: `grant:${grantId}`,
    });
    return revoked;
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
    const existing = await this.prisma.space.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (existing) {
      await this.ensureMembership(userId, id, 'owner');
      return existing;
    }
    await this.prisma.space.create({
      data: {
        id,
        slug: id,
        name: '生活空间',
        type: 'life',
        description: '个人 Life Space（默认仅本人）',
      },
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

  private async ensureMembership(
    userId: string,
    spaceId: string,
    role: string,
  ) {
    const existing = await this.prisma.membership.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
      select: { id: true },
    });
    if (!existing) {
      await this.prisma.membership.create({ data: { spaceId, userId, role } });
    }
  }

  /** 幂等确保用户对 space 有访问（IM/CLI 等非登录渠道首次进入时调用）。 */
  async ensureMembershipIfMissing(userId: string, spaceId: string) {
    await this.ensureMembership(userId, spaceId, 'member');
  }
}
