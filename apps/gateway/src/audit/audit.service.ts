/**
 * audit.service.ts —— Phase 7 7b：审计日志。
 * 记录"谁、在哪个 Space、因何授权、用了什么输入"（工具写操作/审批/授权变更），
 * 查询侧强制：spaceId 必须调用者可访问；actorUserId 过滤仅限本人。
 */
import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SpaceService } from '../space/space.service';

export interface AuditRecordInput {
  actorUserId: string;
  action: string;
  spaceId: string;
  runId?: string | null;
  toolName?: string | null;
  inputJson?: unknown;
  authorization?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly spaceService: SpaceService,
  ) {}

  async record(data: AuditRecordInput): Promise<{ id: string }> {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: data.actorUserId,
        action: data.action,
        spaceId: data.spaceId,
        runId: data.runId ?? null,
        toolName: data.toolName ?? null,
        inputJson:
          data.inputJson === undefined ? undefined : (data.inputJson as object),
        authorization: data.authorization ?? null,
      },
      select: { id: true },
    });
  }

  /**
   * 查询审计。spaceId 缺省 → 调用者可访问的全部空间；actorUserId 仅限本人。
   * 跨 Space / 他人操作日志一律不可见。
   */
  async list(userId: string, opts: { spaceId?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    let spaces: string[];
    if (opts.spaceId) {
      await this.spaceService.requireAccessibleSpace(userId, opts.spaceId); // 404/403
      spaces = [opts.spaceId];
    } else {
      const memberships = await this.prisma.membership.findMany({
        where: { userId },
        select: { spaceId: true },
      });
      spaces = memberships.map((m) => m.spaceId);
    }
    return this.prisma.auditLog.findMany({
      where: {
        spaceId: { in: spaces },
        actorUserId: userId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
