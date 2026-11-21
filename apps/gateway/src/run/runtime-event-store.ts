import { Prisma } from '@prisma/client';
import { replayRuntime, type RuntimeEvent, type RuntimeEventStore } from '@ocean/core';

/** PostgreSQL adapter for the same event protocol used by the CLI local host.
 * Dedicated rows avoid interfering with Gateway's legacy RunEvent sequence.
 */
export class PrismaRuntimeEventStore implements RuntimeEventStore {
  constructor(private readonly prisma: Pick<Prisma.TransactionClient, 'runtimeCoreEvent'>) {}

  async read(runId: string): Promise<readonly RuntimeEvent[]> {
    const rows = await this.prisma.runtimeCoreEvent.findMany({
      where: { runId },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, payload: true },
    });
    if (!rows.length) return [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].sequence !== i + 1) throw new Error('Runtime event sequence gap');
    }
    const events = rows.map(row => row.payload as unknown as RuntimeEvent);
    replayRuntime(runId, events);
    return events;
  }

  async append(runId: string, expectedRevision: number, events: readonly RuntimeEvent[]): Promise<number> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error('Invalid runtime expected revision');
    const existing = await this.read(runId);
    if (existing.length !== expectedRevision) throw new Error('Runtime revision conflict');
    if (!events.length) return existing.length;
    const next = [...existing, ...events];
    replayRuntime(runId, next);
    // A unique (runId, sequence) index is the cross-process CAS fence.
    // Competing writers cannot both commit the same expected revision.
    await this.prisma.runtimeCoreEvent.createMany({
      data: events.map((event, index) => ({
        runId,
        sequence: expectedRevision + index + 1,
        payload: event as unknown as Prisma.InputJsonValue,
      })),
    });
    return next.length;
  }
}
