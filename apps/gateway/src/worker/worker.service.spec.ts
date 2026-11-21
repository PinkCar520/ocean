import { WorkerService } from './worker.service';
import { RunRunner, RetryableError } from './run-runner';
import type { LeasedRunJob } from '@ocean/contracts';

const job: LeasedRunJob = {
  id: 'outbox_1',
  topic: 'run.requested',
  payload: { version: 1, runId: 'run_1', userId: 'user_1' },
  attempts: 1,
  lockedAt: '2026-09-15T02:00:00.000Z',
};

function createWorker(
  options: {
    jobs?: LeasedRunJob[];
    executeResult?: unknown;
    executeError?: unknown;
    staleRuns?: Array<{ id: string; userId: string }>;
    unknownSteps?: Array<{ id: string }>;
    reconcileError?: Error;
  } = {},
) {
  const outbox = {
    claimRunRequests: jest.fn().mockResolvedValue(options.jobs ?? [job]),
    markProcessed: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
    renewLease: jest.fn().mockResolvedValue(true),
  };
  const runner = {
    execute: options.executeError
      ? jest.fn().mockRejectedValue(options.executeError)
      : jest.fn().mockResolvedValue(
          options.executeResult ?? {
            jobId: job.id,
            runId: job.payload.runId,
            status: 'succeeded',
          },
        ),
  };
  const toolExecutor = {
    execute: jest.fn().mockResolvedValue({
      jobId: 'tool_job_1',
      runId: 'run_1',
      status: 'succeeded',
    }),
  };

  const tx = {
    agentRun: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'run_1',
        userId: 'user_1',
        status: 'running',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    runStep: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    outboxEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    runEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const reconciler = { reconcile: options.reconcileError ? jest.fn().mockRejectedValue(options.reconcileError) : jest.fn().mockResolvedValue('unknown') };
  const prisma = {
    runStep: { findMany: jest.fn().mockResolvedValue(options.unknownSteps ?? []) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
    agentRun: {
      findMany: jest.fn().mockResolvedValue(options.staleRuns ?? []),
    },
  };

  const worker = new WorkerService(
    runner as unknown as RunRunner,
    toolExecutor as never,
    outbox as never,
    prisma as never,
    undefined,
    reconciler as never,
  );
  return { worker, outbox, runner, toolExecutor, prisma, tx, reconciler };
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('WorkerService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('queries unknown tool outcomes before dispatch without replaying their side effects', async () => {
    const { worker, prisma, reconciler, runner } = createWorker({
      unknownSteps: [{ id: 'unknown-1' }, { id: 'unknown-2' }],
    });
    worker.start();
    await flush();
    await flush();
    worker.stop();
    expect(prisma.runStep.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { kind: 'tool_call', status: 'unknown' }, take: 20,
    }));
    expect(reconciler.reconcile).toHaveBeenCalledTimes(2);
    expect(reconciler.reconcile).toHaveBeenNthCalledWith(1, 'unknown-1');
    expect(reconciler.reconcile).toHaveBeenNthCalledWith(2, 'unknown-2');
    expect(runner.execute).toHaveBeenCalledTimes(1);
  });

  it('continues dispatching when an outcome query fails, without retrying the side effect', async () => {
    const { worker, reconciler, runner } = createWorker({
      unknownSteps: [{ id: 'lost-result' }], reconcileError: new Error('provider timeout'),
    });
    worker.start();
    await flush();
    await flush();
    worker.stop();
    expect(reconciler.reconcile).toHaveBeenCalledWith('lost-result');
    expect(runner.execute).toHaveBeenCalledTimes(1);
  });

  it('claims, executes and acknowledges a run job', async () => {
    const { worker, outbox, runner } = createWorker();

    worker.start();
    await flush();
    await flush();
    worker.stop();

    expect(outbox.claimRunRequests).toHaveBeenCalledWith(
      expect.stringContaining('worker-'),
      5,
      30_000,
    );
    expect(runner.execute).toHaveBeenCalledWith(job);
    expect(outbox.markProcessed).toHaveBeenCalledWith(
      'outbox_1',
      expect.stringContaining('worker-'),
    );
    expect(outbox.markFailed).not.toHaveBeenCalled();
  });

  it('marks a retryable failure for delayed retry', async () => {
    const { worker, outbox } = createWorker({
      executeResult: {
        jobId: job.id,
        runId: job.payload.runId,
        status: 'failed',
        retryable: true,
        error: 'db timeout',
      },
    });

    worker.start();
    await flush();
    await flush();
    worker.stop();

    expect(outbox.markFailed).toHaveBeenCalledWith(
      'outbox_1',
      expect.stringContaining('worker-'),
      'db timeout',
      expect.any(Number),
    );
    expect(outbox.markProcessed).not.toHaveBeenCalled();
  });

  it('acknowledges a terminal business failure without retrying', async () => {
    const { worker, outbox } = createWorker({
      executeResult: {
        jobId: job.id,
        runId: job.payload.runId,
        status: 'failed',
        retryable: false,
        error: 'permission denied',
      },
    });

    worker.start();
    await flush();
    await flush();
    worker.stop();

    expect(outbox.markProcessed).toHaveBeenCalledWith(
      'outbox_1',
      expect.stringContaining('worker-'),
    );
    expect(outbox.markFailed).not.toHaveBeenCalled();
  });

  it('returns the job to the queue when the runner crashes without a contract result', async () => {
    const { worker, outbox } = createWorker({
      executeError: new RetryableError('connection reset'),
    });

    worker.start();
    await flush();
    await flush();
    worker.stop();

    expect(outbox.markFailed).toHaveBeenCalledWith(
      'outbox_1',
      expect.stringContaining('worker-'),
      'connection reset',
      expect.any(Number),
    );
  });

  it('routes a tool.requested job to the ToolExecutor', async () => {
    const toolJob: LeasedRunJob = {
      id: 'outbox_2',
      topic: 'tool.requested',
      payload: {
        version: 1,
        runId: 'run_1',
        userId: 'user_1',
        toolCall: {
          id: 'tool_call_1',
          name: 'echo',
          input: { text: 'hi' },
          idempotencyKey: 'k1',
        },
      },
      attempts: 1,
      lockedAt: '2026-09-15T02:00:00.000Z',
    };
    const { worker, outbox, runner, toolExecutor } = createWorker({
      jobs: [toolJob],
    });

    worker.start();
    await flush();
    await flush();
    worker.stop();

    expect(runner.execute).not.toHaveBeenCalled();
    expect(toolExecutor.execute).toHaveBeenCalledWith(toolJob);
    expect(outbox.markProcessed).toHaveBeenCalled();
  });

  it('recovers stale running runs by re-queuing and re-enqueueing a missing message', async () => {
    const { worker, prisma, tx } = createWorker({
      staleRuns: [{ id: 'run_1', userId: 'user_1' }],
    });

    await (
      worker as never as { recoverStaleRuns(): Promise<void> }
    ).recoverStaleRuns();

    expect(tx.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'queued' }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: 'run.requested',
          aggregateId: 'run_1',
        }),
      }),
    );
    expect(tx.runEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentRun.findMany).toHaveBeenCalled();
  });

  it('does not touch runs that are no longer in running state', async () => {
    const { worker, tx } = createWorker({
      staleRuns: [{ id: 'run_1', userId: 'user_1' }],
    });
    tx.agentRun.findUnique.mockResolvedValue({
      id: 'run_1',
      userId: 'user_1',
      status: 'succeeded',
    });

    await (
      worker as never as { recoverStaleRuns(): Promise<void> }
    ).recoverStaleRuns();

    expect(tx.agentRun.update).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
