import { ForbiddenException } from '@nestjs/common';

import { RunService } from './run.service';

describe('RunService', () => {
  const runs = new Map<string, any>();
  const events = new Map<string, any[]>();
  let nextRun = 1;

  const agentRun = {
    findUnique: jest.fn(async ({ where, include }: any) => {
      let run = where.id ? runs.get(where.id) : undefined;
      if (where.userId_idempotencyKey) {
        run = [...runs.values()].find(
          item =>
            item.userId === where.userId_idempotencyKey.userId &&
            item.idempotencyKey === where.userId_idempotencyKey.idempotencyKey,
        );
      }
      return run && include ? { ...run, events: events.get(run.id) ?? [] } : run ?? null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const now = new Date('2026-09-14T04:30:00.000Z');
      const run = { id: `run_${nextRun++}`, metadata: null, idempotencyKey: null, ...data, createdAt: now, updatedAt: now };
      runs.set(run.id, run);
      return run;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const run = { ...runs.get(where.id), ...data, updatedAt: new Date('2026-09-14T04:31:00.000Z') };
      runs.set(run.id, run);
      return run;
    }),
  };
  const runEvent = {
    create: jest.fn(async ({ data }: any) => {
      const row = { ...data };
      events.set(data.runId, [...(events.get(data.runId) ?? []), row]);
      return row;
    }),
  };
  const prisma = {
    agentRun,
    runEvent,
    $transaction: jest.fn(async (operation: (transaction: any) => unknown) => operation(prisma)),
  };
  const outbox = { enqueueRunRequested: jest.fn(async () => undefined) };
  const service = new RunService(prisma as never, outbox as never);

  beforeEach(() => {
    runs.clear();
    events.clear();
    nextRun = 1;
    jest.clearAllMocks();
  });

  it('persists a queued run and its first validated event', async () => {
    const snapshot = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'Prepare a report',
    });

    expect(snapshot.run.status).toBe('queued');
    expect(snapshot.events).toMatchObject([{ type: 'run.created', sequence: 0 }]);
    expect(outbox.enqueueRunRequested).toHaveBeenCalledWith(
      prisma,
      { version: 1, runId: snapshot.run.id, userId: 'user_1' },
    );
  });

  it('returns the existing run for the same user idempotency key', async () => {
    const request = { space: { id: 'space_1', type: 'code' as const }, input: 'Review', idempotencyKey: 'request_1' };
    const first = await service.create('user_1', request);
    const second = await service.create('user_1', request);

    expect(second.run.id).toBe(first.run.id);
    expect(agentRun.create).toHaveBeenCalledTimes(1);
  });

  it('rejects access from another user', async () => {
    const snapshot = await service.create('user_1', { space: { id: 'space_1', type: 'life' }, input: 'Plan' });

    await expect(service.get(snapshot.run.id, 'user_2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cancels a queued run and appends a sequenced event', async () => {
    const created = await service.create('user_1', { space: { id: 'space_1', type: 'work' }, input: 'Prepare' });
    const cancelled = await service.cancel(created.run.id, 'user_1');

    expect(cancelled.run.status).toBe('cancelled');
    expect(cancelled.events.at(-1)).toMatchObject({ type: 'run.status_changed', status: 'cancelled', sequence: 1 });
  });
});
