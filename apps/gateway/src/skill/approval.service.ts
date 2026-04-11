import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolName: string;
  args: any;
  status: 'pending' | 'approved' | 'denied';
  responseBy?: string;
  responseAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApprovalRequestDto {
  sessionId: string;
  toolName: string;
  args: any;
  /** 超时时间（毫秒），默认 30 分钟 */
  timeoutMs?: number;
}

/**
 * ApprovalService
 *
 * Manages pending approval requests for tools that require user confirmation.
 * Uses Prisma for persistence — supports multi-instance deployment and survives restarts.
 */
@Injectable()
export class ApprovalService {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  /**
   * Create a new pending approval request.
   * @returns The ID of the created request.
   */
  async createRequest(data: CreateApprovalRequestDto): Promise<string> {
    const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = data.timeoutMs ?? 30 * 60 * 1000; // 30 分钟默认超时

    await this.prisma.approvalRequest.create({
      data: {
        id,
        sessionId: data.sessionId,
        toolName: data.toolName,
        args: data.args,
        status: 'pending',
        expiresAt: new Date(Date.now() + timeoutMs),
      },
    });

    return id;
  }

  /**
   * Get request by ID. Returns null if not found or expired.
   */
  async getRequest(id: string): Promise<ApprovalRequest | null> {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });

    if (!req) return null;

    // 自动标记过期请求
    if (req.status === 'pending' && new Date() > req.expiresAt) {
      await this.prisma.approvalRequest.update({
        where: { id },
        data: { status: 'denied' },
      });
      return { ...req, status: 'denied' } as ApprovalRequest;
    }

    return this.mapToApprovalRequest(req);
  }

  /**
   * Get all pending (non-expired) requests for a session.
   */
  async getSessionPendingRequests(sessionId: string): Promise<ApprovalRequest[]> {
    const rows = await this.prisma.approvalRequest.findMany({
      where: {
        sessionId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this.mapToApprovalRequest);
  }

  /**
   * Respond to an approval request.
   * @returns true if the response was applied successfully.
   */
  async respondToRequest(
    id: string,
    status: 'approved' | 'denied',
    userId?: string,
  ): Promise<boolean> {
    const updated = await this.prisma.approvalRequest.updateMany({
      where: {
        id,
        status: 'pending',
        expiresAt: { gt: new Date() }, // 不能响应已过期的请求
      },
      data: {
        status,
        responseBy: userId || null,
        responseAt: new Date(),
      },
    });

    return updated.count > 0;
  }

  /**
   * Check approval status (used by tool execution to poll for results).
   * @returns 'approved' | 'denied' | 'pending' | null (not found)
   */
  async getStatus(id: string): Promise<'approved' | 'denied' | 'pending' | null> {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id },
      select: { status: true, expiresAt: true },
    });

    if (!req) return null;

    // 超时自动视为拒绝
    if (req.status === 'pending' && new Date() > req.expiresAt) {
      await this.prisma.approvalRequest.update({
        where: { id },
        data: { status: 'denied' },
      });
      return 'denied';
    }

    return req.status as 'approved' | 'denied' | 'pending';
  }

  /**
   * Wait for an approval request to be resolved (approved or denied).
   * Polls the database every second until resolved or timeout.
   *
   * This is the key method for the "blocking wait" pattern in tools.
   * The tool execute() calls this and blocks the agentic loop until the user responds.
   *
   * @returns true if approved, false if denied or timed out.
   */
  async waitForApproval(requestId: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const status = await this.getStatus(requestId);

      if (status === 'approved') return true;
      if (status === 'denied') return false;

      // Still pending — wait 1s before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Timed out — treat as denied
    return false;
  }

  /**
   * Clean up expired approval requests (can be run as a cron job).
   * @returns number of deleted records.
   */
  async cleanupExpired(): Promise<number> {
    const deleted = await this.prisma.approvalRequest.deleteMany({
      where: {
        status: { not: 'pending' },
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 清理 24 小时前的非 pending 记录
      },
    });

    return deleted.count;
  }

  private mapToApprovalRequest(row: any): ApprovalRequest {
    return {
      id: row.id,
      sessionId: row.sessionId,
      toolName: row.toolName,
      args: row.args,
      status: row.status as ApprovalRequest['status'],
      responseBy: row.responseBy,
      responseAt: row.responseAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
