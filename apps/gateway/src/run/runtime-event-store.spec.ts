import { PrismaRuntimeEventStore } from './runtime-event-store';
import type { PrismaClient } from '@prisma/client';

describe('Gateway portable runtime event persistence', () => {
 it('replays committed events and rejects stale append revisions', async () => {
  const rows: Array<{ sequence: number; payload: unknown }> = [];
  const prisma = {
   runtimeCoreEvent: {
    findMany: async () => [...rows],
    createMany: async ({ data }: any) => {
      for (const row of data) {
        if (rows.some(existing => existing.sequence === row.sequence)) throw new Error('Unique constraint');
        rows.push({ sequence: row.sequence, payload: row.payload });
      }
    },
   },
  } as unknown as PrismaClient;
  const store = new PrismaRuntimeEventStore(prisma);
  const created = { type: 'run.created' as const, runId: 'r', at: '2026-01-01T00:00:00Z' };
  expect(await store.append('r', 0, [created])).toBe(1);
  expect(await store.read('r')).toEqual([created]);
  await expect(store.append('r', 0, [created])).rejects.toThrow('revision conflict');
 });
});
