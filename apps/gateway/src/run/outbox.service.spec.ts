import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    outboxEvent: { updateMany: jest.fn() },
  };
  const service = new OutboxService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('validates jobs claimed with a worker lease', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'outbox_1',
        topic: 'run.requested',
        payload: { version: 1, runId: 'run_1', userId: 'user_1' },
        attempts: 1,
        lockedAt: new Date('2026-09-14T04:30:00.000Z'),
      },
    ]);

    await expect(service.claimRunRequests('worker_1')).resolves.toEqual([
      {
        id: 'outbox_1',
        topic: 'run.requested',
        payload: { version: 1, runId: 'run_1', userId: 'user_1' },
        attempts: 1,
        lockedAt: '2026-09-14T04:30:00.000Z',
      },
    ]);
  });

  it('only acknowledges a message held by the worker', async () => {
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.markProcessed('outbox_1', 'worker_1')).resolves.toBe(true);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'outbox_1', status: 'pending', lockedBy: 'worker_1' } }),
    );
  });

  it('releases failed messages for a delayed retry', async () => {
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.markFailed('outbox_1', 'worker_1', 'temporary failure', 5_000)).resolves.toBe(true);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: 'temporary failure', lockedAt: null, lockedBy: null }),
      }),
    );
  });
});
