/**
 * privacy.service.ts —— Phase 7 7c：数据导出与账号删除（保留策略基础）。
 * - exportData：本人数据 JSON 导出（profile、会话、记忆、Run、审计、授权）。
 * - deleteAccount：级联删除本人数据（依赖 Prisma onDelete Cascade），
 *   共享 Space（work/code）保留，仅移除本人 membership。
 */
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrivacyService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async exportData(userId: string) {
    const [user, memberships, sessions, memories, runs, audits, grants] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, workId: true, name: true, email: true, department: true, createdAt: true },
      }),
      this.prisma.membership.findMany({ where: { userId }, select: { spaceId: true, role: true } }),
      this.prisma.session.findMany({
        where: { userId },
        select: { id: true, title: true, spaceId: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.lifeMemory.findMany({
        where: { spaceId: `life-${userId}` },
        select: { id: true, content: true, tags: true, type: true, createdAt: true },
      }),
      this.prisma.agentRun.findMany({
        where: { userId },
        select: { id: true, status: true, spaceId: true, input: true, createdAt: true },
        take: 500,
      }),
      this.prisma.auditLog.findMany({ where: { actorUserId: userId }, take: 1000 }),
      this.prisma.contextGrant.findMany({
        where: { grantedByUserId: userId },
        select: { id: true, fromSpaceId: true, toSpaceId: true, purpose: true, createdAt: true },
      }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      user,
      memberships,
      sessions,
      lifeMemories: memories,
      runs,
      audits,
      grants,
    };
  }

  /** 删除本人账号（确认口令防误触）。依赖 FK 级联清理会话/记忆/Run/审计/授权。 */
  async deleteAccount(userId: string, confirm: string) {
    if (confirm !== 'DELETE') {
      throw new BadRequestException("Confirmation required: pass confirm='DELETE'");
    }
    // Life Space 数据挂在 space 上（非 user FK）：先显式清理本人 Life Space
    const lifeId = `life-${userId}`;
    await this.prisma.lifeMemory.deleteMany({ where: { spaceId: lifeId } });
    await this.prisma.space
      .delete({ where: { id: lifeId } })
      .catch(() => undefined); // 从未开过 Life Space 则跳过
    // 删 membership（共享 Space 保留，仅移除本人），再删用户（级联其余数据）
    await this.prisma.membership.deleteMany({ where: { userId } });
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }
}
