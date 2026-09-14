import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  leasedRunJobSchema,
  runRequestedMessageSchema,
  type LeasedRunJob,
  type RunRequestedMessage,
} from '@ocean/contracts';

type TransactionClient = Prisma.TransactionClient;

interface ClaimedOutboxRow {
  id: string;
  topic: string;
  payload: Prisma.JsonValue;
  attempts: number;
  lockedAt: Date;
}

@Injectable()
export class OutboxService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async enqueueRunRequested(
    transaction: TransactionClient,
    message: RunRequestedMessage,
  ): Promise<void> {
    const payload = runRequestedMessageSchema.parse(message);
    await transaction.outboxEvent.create({
      data: {
        topic: 'run.requested',
        aggregateType: 'AgentRun',
        aggregateId: payload.runId,
        payload,
      },
    });
  }

  async claimRunRequests(workerId: string, limit = 10, leaseMs = 30_000): Promise<LeasedRunJob[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const safeLeaseMs = Math.max(1_000, leaseMs);
    const rows = await this.prisma.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "outbox_events"
        WHERE "topic" = 'run.requested'
          AND "status" = 'pending'
          AND "availableAt" <= NOW()
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${safeLeaseMs} * INTERVAL '1 millisecond'))
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE "outbox_events" AS event
      SET "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
      FROM candidates
      WHERE event."id" = candidates."id"
      RETURNING event."id", event."topic", event."payload", event."attempts", event."lockedAt"
    `);

    return rows.map(row =>
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
      data: { status: 'processed', processedAt: new Date(), lockedAt: null, lockedBy: null },
    });
    return result.count === 1;
  }

  async markFailed(id: string, workerId: string, error: string, retryDelayMs: number): Promise<boolean> {
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
