import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DEVICE_RPC_TOPIC } from '../tool/device-rpc.broker';
import { RemoteRpcError, RpcGateway } from './rpc.gateway';

/** A Gateway dispatches persisted requests only for CLI sockets connected to this process. */
@Injectable()
export class DeviceRpcDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly instanceId = `gateway-${randomUUID()}`;
  private readonly logger = new Logger(DeviceRpcDispatcher.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient, private readonly rpc: RpcGateway) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.poll().catch(error => this.logger.error(`Device dispatch failed: ${error.message}`)), 250);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const workId of this.rpc.getOnlineUsers()) {
        const rows = await this.prisma.outboxEvent.findMany({
          where: { topic: DEVICE_RPC_TOPIC, status: 'pending', payload: { path: ['workId'], equals: workId } },
          orderBy: { createdAt: 'asc' }, take: 10,
        });
        await Promise.all(rows.map(row => this.dispatch(row)));
      }
    } finally { this.busy = false; }
  }

  private async dispatch(row: { id: string; payload: Prisma.JsonValue }): Promise<void> {
    const request = row.payload as { runId?: unknown; userId?: unknown; workId?: unknown; sessionId?: unknown; method?: unknown; input?: unknown; expiresAt?: unknown } | null;
    if (!request || typeof request.runId !== 'string' || typeof request.userId !== 'string' || typeof request.workId !== 'string' || typeof request.sessionId !== 'string' ||
      !['notebook_read', 'notebook_edit', 'file_read', 'file_write', 'file_edit', 'file_patch'].includes(String(request.method)) || !request.input || typeof request.input !== 'object' || Array.isArray(request.input) || typeof request.expiresAt !== 'string' || !Number.isFinite(Date.parse(request.expiresAt))) {
      await this.prisma.outboxEvent.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'failed', lastError: 'Invalid device request.' } });
      return;
    }
    if (Date.parse(request.expiresAt) <= Date.now()) {
      await this.prisma.outboxEvent.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'failed', lastError: 'Device request expired before dispatch.' } });
      return;
    }
    const run = await this.prisma.agentRun.findUnique({ where: { id: request.runId }, select: { userId: true, status: true } });
    if (!run || run.userId !== request.userId || run.status !== 'running') {
      await this.prisma.outboxEvent.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'cancelled', lastError: 'Run is no longer active.' } });
      return;
    }
    const claim = await this.prisma.outboxEvent.updateMany({
      where: { id: row.id, status: 'pending' },
      data: { status: 'dispatched', lockedBy: this.instanceId, lockedAt: new Date() },
    });
    if (!claim.count) return;
    try {
      const result = await this.rpc.sendToCli(request.workId, String(request.method), { ...request.input, sessionId: request.sessionId });
      const payload = JSON.parse(JSON.stringify({ ...request, result: result ?? null })) as Prisma.InputJsonValue;
      await this.prisma.outboxEvent.updateMany({ where: { id: row.id, status: 'dispatched', lockedBy: this.instanceId }, data: { status: 'processed', payload, processedAt: new Date(), lockedAt: null, lockedBy: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof RemoteRpcError ? 'failed' : 'uncertain';
      await this.prisma.outboxEvent.updateMany({ where: { id: row.id, status: 'dispatched', lockedBy: this.instanceId }, data: { status, lastError: status === 'uncertain' ? `Device result is unknown; do not automatically repeat this operation: ${message}` : message, lockedAt: null, lockedBy: null } });
    }
  }
}
