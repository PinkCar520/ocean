import { Prisma } from '@prisma/client';
import type { LeasedRunJob } from '@ocean/contracts';

export class LostRunOwnership extends Error {}
export async function claimRun(tx: Prisma.TransactionClient, job: LeasedRunJob, token: string, leaseMs: number): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE agent_runs r SET "executionToken" = ${token}, "executionJobId" = ${job.id}, "executionAttempt" = ${job.attempts}
    WHERE r.id = ${job.payload.runId} AND r."userId" = ${job.payload.userId}
      AND r.status IN ('queued', 'running')
      AND EXISTS (SELECT 1 FROM outbox_events e WHERE e.id = ${job.id} AND e.status = 'pending'
        AND e.attempts = ${job.attempts} AND e."lockedAt" > NOW() - (${leaseMs} * INTERVAL '1 millisecond'))
      AND (r."executionToken" IS NULL OR NOT EXISTS (
        SELECT 1 FROM outbox_events old WHERE old.id = r."executionJobId" AND old.status = 'pending'
        AND old."lockedAt" > NOW() - (${leaseMs} * INTERVAL '1 millisecond')
        AND old.attempts = r."executionAttempt"))
    RETURNING r.id
  `);
  return rows.length === 1;
}

export async function verifyRun(tx: Prisma.TransactionClient, job: LeasedRunJob, token: string, leaseMs: number): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT r.id FROM agent_runs r WHERE r.id = ${job.payload.runId} AND r."executionToken" = ${token}
      AND EXISTS (SELECT 1 FROM outbox_events e WHERE e.id = ${job.id} AND e.status = 'pending'
        AND e.attempts = ${job.attempts} AND e."lockedAt" > NOW() - (${leaseMs} * INTERVAL '1 millisecond'))
    FOR UPDATE OF r
  `);
  if (rows.length !== 1) throw new LostRunOwnership('Run execution ownership or lease lost');
}
