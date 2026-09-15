import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SpaceService } from '../space/space.service';

export interface CreateMemoryDto {
  content: string;
  tags?: string[];
  type?: 'note' | 'reminder' | 'preference' | 'diary';
}

/**
 * LifeService —— Phase 6 6e：Life 投影（个人记忆 / 隐私）。
 * 数据归属用户专属 Life Space（life-<userId>），仅本人可读写；
 * 跨用户访问一律 Forbidden（同 Space 边界）。
 */
@Injectable()
export class LifeService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly spaceService: SpaceService,
  ) {}

  private spaceIdFor(userId: string): string {
    return SpaceService.lifeSpaceIdFor(userId);
  }

  private async guard(userId: string) {
    const spaceId = this.spaceIdFor(userId);
    // 幂等创建本人 Life Space + owner membership
    await this.spaceService.ensureLifeSpace(userId);
    await this.spaceService.requireAccessibleSpace(userId, spaceId);
    return spaceId;
  }

  /** 记忆列表（按时间倒序）。 */
  async listMemories(userId: string) {
    const spaceId = await this.guard(userId);
    return this.prisma.lifeMemory.findMany({
      where: { spaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 新建个人记忆。 */
  async createMemory(userId: string, dto: CreateMemoryDto) {
    const spaceId = await this.guard(userId);
    return this.prisma.lifeMemory.create({
      data: {
        content: dto.content,
        tags: dto.tags ?? [],
        type: dto.type ?? 'note',
        spaceId,
      },
    });
  }

  /** 删除记忆（仅本人 Life Space 内）。 */
  async deleteMemory(userId: string, memoryId: string) {
    const spaceId = await this.guard(userId);
    const memory = await this.prisma.lifeMemory.findFirst({
      where: { id: memoryId, spaceId },
      select: { id: true },
    });
    if (!memory) throw new NotFoundException(`Memory ${memoryId} not found`);
    await this.prisma.lifeMemory.delete({ where: { id: memoryId } });
    return { deleted: true };
  }

  /** 隐私概览：本人 Life Space 的授权（ContextGrant）与策略（PolicySet）。 */
  async privacyOverview(userId: string) {
    const spaceId = await this.guard(userId);
    const [grants, policies] = await Promise.all([
      this.prisma.contextGrant.findMany({
        where: { fromSpaceId: spaceId, revokedAt: null },
        select: {
          id: true,
          toSpaceId: true,
          toSpace: { select: { id: true, name: true, slug: true } },
          scope: true,
          purpose: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.policySet.findMany({
        where: { spaceId },
        select: { key: true, rules: true },
        orderBy: { key: 'asc' },
      }),
    ]);
    return { grants, policies };
  }
}
