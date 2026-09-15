import { RetryableError, RunRunner } from './run-runner';
import type { LeasedRunJob } from '@ocean/contracts';
import { MODEL_GATEWAY, type ModelGateway } from '../ai/model-gateway';

const job: LeasedRunJob = {
  id: 'outbox_1',
  topic: 'run.requested',
  payload: { version: 1, runId: 'run_1', userId: 'user_1' },
  attempts: 1,
  lockedAt: '2026-09-15T02:00:00.000Z',
};

async function* textStream(...chunks: string[]) {
  for (const chunk of chunks) {
    yield { text: chunk };
  }
}

function createTxMock(
  run: { id: string; userId: string; status: string; input?: string } | null,
  startedStep: { id: string; seq: number; status: string } | null = null,
) {
  const tx = {
    agentRun: {
      findUnique: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockResolvedValue({}),
    },
    runEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    runStep: {
      findFirst: jest.fn().mockResolvedValue(startedStep),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return tx;
}

function createRunner(
  run: { id: string; userId: string; status: string; input?: string } | null,
  startedStep: { id: string; seq: number; status: string } | null = null,
  gatewayStream?: AsyncIterable<{ text: string }>,
) {
  const tx = createTxMock(run, startedStep);
  const prisma = {
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
  };
  const gateway: ModelGateway = {
    stream: jest
      .fn()
      .mockReturnValue(
        gatewayStream ?? textStream('hello world from the model'),
      ),
  };
  const runner = new RunRunner(prisma as never, gateway);
  return { runner, prisma, tx, gateway };
}

describe('RunRunner', () => {
  const originalSimMs = process.env.WORKER_SIM_MS;

  beforeEach(() => {
    process.env.WORKER_SIM_MS = '0';
  });

  afterEach(() => {
    process.env.WORKER_SIM_MS = originalSimMs;
    jest.restoreAllMocks();
  });

  it('executes a queued run: model_call step + output_delta + succeeded events', async () => {
    const { runner, tx, gateway } = createRunner({
      id: 'run_1',
      userId: 'user_1',
      status: 'queued',
      input: '你好',
    });

    const result = await runner.execute(job);

    expect(result).toEqual({
      jobId: 'outbox_1',
      runId: 'run_1',
      status: 'succeeded',
    });
    expect(gateway.stream).toHaveBeenCalledWith('你好');

    // runStep：创建 started + 更新 succeeded
    expect(tx.runStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'model_call',
          status: 'started',
        }),
      }),
    );
    expect(tx.runStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );

    // 事件序列：running → step_started → output_delta → step_completed → succeeded
    const eventTypes = tx.runEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload.type,
    );
    expect(eventTypes).toEqual([
      'run.status_changed', // running
      'run.step_started',
      'run.output_delta',
      'run.step_completed',
      'run.status_changed', // succeeded
    ]);

    // step 事件里带 model_call 步骤信息
    const stepStarted = tx.runEvent.create.mock.calls[1][0].data.payload;
    expect(stepStarted.step).toEqual(
      expect.objectContaining({
        kind: 'model_call',
        status: 'started',
        runId: 'run_1',
      }),
    );
    const stepCompleted = tx.runEvent.create.mock.calls[3][0].data.payload;
    expect(stepCompleted.step).toEqual(
      expect.objectContaining({ kind: 'model_call', status: 'succeeded' }),
    );
    expect(stepCompleted.step.output).toEqual({
      text: 'hello world from the model',
    });
  });

  it('flushes output_delta multiple times for long streams', async () => {
    // 模拟真实模型：逐小块增量输出（ai-sdk 是 token 级 delta）
    const chunks = Array.from({ length: 200 }, () => 'x');
    const { runner, tx } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'queued', input: 'i' },
      null,
      textStream(...chunks),
    );

    await runner.execute(job);

    const deltas = tx.runEvent.create.mock.calls.filter(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload
          .type === 'run.output_delta',
    );
    // 200 chars：64+64+64+8 → 4 条 delta
    expect(deltas).toHaveLength(4);
    const deltaText = deltas.map((c) => c[0].data.payload.delta).join('');
    expect(deltaText).toBe('x'.repeat(200));
  });

  it('re-enters a run left in running state and reuses the started step (crash resume)', async () => {
    const { runner, tx } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'running', input: '继续' },
      { id: 'step_1', seq: 1, status: 'started' },
    );

    const result = await runner.execute(job);

    expect(result.status).toBe('succeeded');
    // 不重复写 running 事件、不重复创建步骤/step_started
    const eventTypes = tx.runEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload.type,
    );
    const statusEvents = tx.runEvent.create.mock.calls
      .map((call) => call[0].data.payload)
      .filter((p) => p.type === 'run.status_changed');
    expect(statusEvents.map((p) => p.status)).toEqual(['succeeded']);
    expect(tx.runStep.create).not.toHaveBeenCalled();
    expect(eventTypes).not.toContain('run.step_started');
    // 复用 step_1 并置 succeeded
    expect(tx.runStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step_1' },
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
  });

  it('fails terminally without touching the database when the run does not exist', async () => {
    const { runner, tx } = createRunner(null);

    const result = await runner.execute(job);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        retryable: false,
        error: 'Run run_1 not found',
      }),
    );
    expect(tx.agentRun.update).not.toHaveBeenCalled();
    expect(tx.runEvent.create).not.toHaveBeenCalled();
  });

  it('fails terminally when the run belongs to another user', async () => {
    const { runner, tx } = createRunner({
      id: 'run_1',
      userId: 'user_other',
      status: 'queued',
    });

    const result = await runner.execute(job);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        retryable: false,
        error: expect.stringContaining('does not belong to user'),
      }),
    );
    expect(tx.agentRun.update).not.toHaveBeenCalled();
    expect(tx.runEvent.create).not.toHaveBeenCalled();
  });

  it('returns the run to queued and marks the step failed on retryable model failure', async () => {
    const { runner, tx } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'queued', input: 'hi' },
      { id: 'step_1', seq: 1, status: 'started' },
      (async function* () {
        yield { text: 'partial output before failure' };
        throw new RetryableError('upstream timeout');
      })(),
    );

    const result = await runner.execute(job);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        retryable: true,
        error: 'model call failed: upstream timeout',
      }),
    );
    expect(tx.agentRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'queued' }),
      }),
    );
    // started 步骤被置 failed，供续跑/恢复定位
    const stepUpdate = tx.runStep.update.mock.calls.find(
      (call) => call[0].data?.status === 'failed',
    );
    expect(stepUpdate).toBeDefined();
  });
});
