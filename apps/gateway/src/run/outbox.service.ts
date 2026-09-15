import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  leasedRunJobSchema,
  runRequestedMessageSchema,
  toolRequestedMessageSchema,
  type LeasedRunJob,
  type RunRequestedMessage,
  type ToolRequestedMessage,
} from '@ocean/contracts';

type TransactionClient = Prisma.TransactionClient;

interface ClaimedOutboxRow {
  id: string;
  topic: string;
  payload: Prisma.JsonValue;
  attempts: number;
  lockedAt: Date;
  priorityRank: number;
  createdAt: Date;
}

@Injectable()
export class OutboxService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async enqueueRunRequested(
    transaction: TransactionClient,
    message: RunRequestedMessage,
    priorityRank = 1,
  ): Promise<void> {
    const payload = runRequestedMessageSchema.parse(message);
    await transaction.outboxEvent.create({
      data: {
        topic: 'run.requested',
        aggregateType: 'AgentRun',
        aggregateId: payload.runId,
        payload,
        priorityRank,
      },
    });
  }

  async enqueueToolRequested(
    transaction: TransactionClient,
    message: ToolRequestedMessage,
    priorityRank = 1,
  ): Promise<void> {
    const payload = toolRequestedMessageSchema.parse(message);
    await transaction.outboxEvent.create({
      data: {
        topic: 'tool.requested',
        aggregateType: 'AgentRun',
        aggregateId: payload.runId,
        payload: payload as Prisma.InputJsonValue,
        priorityRank,
      },
    });
  }

  async claimRunRequests(
    workerId: string,
    limit = 10,
    leaseMs = 30_000,
  ): Promise<LeasedRunJob[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const safeLeaseMs = Math.max(1_000, leaseMs);
    const rows = await this.prisma.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "outbox_events"
        WHERE "topic" IN ('run.requested', 'tool.requested')
          AND "status" = 'pending'
          AND "availableAt" <= NOW()
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${safeLeaseMs} * INTERVAL '1 millisecond'))
        ORDER BY "priorityRank", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      ),
      claimed AS (
        UPDATE "outbox_events" AS event
        SET "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
        FROM candidates
        WHERE event."id" = candidates."id"
        RETURNING event."id", event."topic", event."payload", event."attempts", event."lockedAt", event."priorityRank", event."createdAt"
      )
      SELECT * FROM claimed
      ORDER BY "priorityRank", "createdAt"
    `);

    return rows.map((row) =>
      leasedRunJobSchema.parse({
        id: row.id,
        topic: row.topic,
        payload: row.payload,
        attempts: row.attempts,
        lockedAt: row.lockedAt.toISOString(),
      }),
    );
  }

  async markProcessed(id: string, workerId: string): Promise<boolean> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id, status: 'pending', lockedBy: workerId },
      data: {
        status: 'processed',
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return result.count === 1;
  }

  /**
   * 心跳续期：长任务执行期间定期刷新租约，避免被其他 Worker 当作失联回收。
   * 仅在消息仍归本 Worker 持有（status=pending 且 lockedBy=workerId）时生效。
   */
  async renewLease(
    id: string,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    const safeLeaseMs = Math.max(1_000, leaseMs);
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id, status: 'pending', lockedBy: workerId },
      data: { lockedAt: new Date(Date.now() + safeLeaseMs) },
    });
    return result.count === 1;
  }

  async markFailed(
    id: string,
    workerId: string,
    error: string,
    retryDelayMs: number,
  ): Promise<boolean> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id, status: 'pending', lockedBy: workerId },
      data: {
        lastError: error.slice(0, 10_000),
        availableAt: new Date(Date.now() + Math.max(1_000, retryDelayMs)),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return result.count === 1;
  }
}
