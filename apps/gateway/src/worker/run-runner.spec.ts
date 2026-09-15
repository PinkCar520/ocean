import { RetryableError, RunRunner } from './run-runner';
import type { LeasedRunJob } from '@ocean/contracts';
import {
  MODEL_GATEWAY,
  type ModelGateway,
  type ModelToolCall,
} from '../ai/model-gateway';

const job: LeasedRunJob = {
  id: 'outbox_1',
  topic: 'run.requested',
  payload: { version: 1, runId: 'run_1', userId: 'user_1' },
  attempts: 1,
  lockedAt: '2026-09-15T02:00:00.000Z',
};

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
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    outboxEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return tx;
}

function createRunner(
  run: { id: string; userId: string; status: string; input?: string } | null,
  opts: {
    startedStep?: { id: string; seq: number; status: string } | null;
    generateResult?: { text: string; toolCalls: ModelToolCall[] };
    generateError?: Error;
    historySteps?: Array<{
      kind: string;
      status: string;
      input?: unknown;
      output?: unknown;
    }>;
  } = {},
) {
  const { startedStep = null, generateResult, generateError, historySteps = [] } =
    opts;
  const tx = createTxMock(run, startedStep);
  const prisma = {
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
    runStep: { findMany: jest.fn().mockResolvedValue(historySteps) },
  };
  const gateway: ModelGateway & { generate: jest.Mock } = {
    generate: jest.fn(async (req?: { onDelta?: (t: string) => void }) => {
      if (generateError) throw generateError;
      const result = generateResult ?? {
        text: 'hello world from the model',
        toolCalls: [],
      };
      if (req?.onDelta) await req.onDelta(result.text);
      return result;
    }),
  };
  const outbox = {
    enqueueToolRequested: jest.fn().mockResolvedValue(undefined),
    enqueueRunRequested: jest.fn().mockResolvedValue(undefined),
  };
  const registry = { list: jest.fn().mockReturnValue([]) };
  const runner = new RunRunner(
    prisma as never,
    gateway as never,
    outbox as never,
    registry as never,
  );
  return { runner, prisma, tx, gateway, outbox };
}

function eventTypes(tx: { runEvent: { create: jest.Mock } }): string[] {
  return tx.runEvent.create.mock.calls.map(
    (call) =>
      (call[0] as { data: { payload: { type: string } } }).data.payload.type,
  );
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
    expect(gateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', text: '你好' }],
        tools: [],
      }),
    );

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
    expect(eventTypes(tx)).toEqual([
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
      toolCalls: [],
    });
  });

  it('flushes output_delta multiple times for long streams', async () => {
    // 模拟真实模型：onDelta 被多次回调（ai-sdk 是 token 级 delta）
    const longText = 'x'.repeat(200);
    const { runner, tx, gateway } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'queued', input: 'i' },
      { generateResult: { text: longText, toolCalls: [] } },
    );
    // 让 onDelta 分块回调
    gateway.generate.mockImplementation(
      async (req: { onDelta?: (t: string) => void }) => {
        for (let i = 0; i < longText.length; i += 16) {
          if (req.onDelta) await req.onDelta(longText.slice(i, i + 16));
        }
        return { text: longText, toolCalls: [] };
      },
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
      { startedStep: { id: 'step_1', seq: 1, status: 'started' } },
    );

    const result = await runner.execute(job);

    expect(result.status).toBe('succeeded');
    // 不重复写 running 事件、不重复创建步骤/step_started
    const statusEvents = tx.runEvent.create.mock.calls
      .map((call) => call[0].data.payload)
      .filter((p) => p.type === 'run.status_changed');
    expect(statusEvents.map((p) => p.status)).toEqual(['succeeded']);
    expect(tx.runStep.create).not.toHaveBeenCalled();
    expect(eventTypes(tx)).not.toContain('run.step_started');
    // 复用 step_1 并置 succeeded
    expect(tx.runStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step_1' },
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
  });

  it('submits a tool.requested and pauses the run when the model requests a tool', async () => {
    const { runner, tx, outbox } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'queued', input: '查一下' },
      {
        generateResult: {
          text: '我来查：',
          toolCalls: [
            { id: 'tc_1', name: 'echo', input: { text: '查一下' } },
          ],
        },
      },
    );

    const result = await runner.execute(job);

    expect(result.status).toBe('succeeded');
    // 工具提交：outbox enqueue + tool.requested 事件 + Run queued
    expect(outbox.enqueueToolRequested).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: 'run_1',
        userId: 'user_1',
        toolCall: expect.objectContaining({
          id: 'tc_1',
          name: 'echo',
          input: { text: '查一下' },
          idempotencyKey: 'tc_1',
        }),
      }),
      expect.anything(),
    );
    const statusEvents = tx.runEvent.create.mock.calls
      .map((call) => call[0].data.payload)
      .filter((p) => p.type === 'run.status_changed');
    expect(statusEvents.map((p) => p.status)).toEqual(['running', 'queued']);
    expect(eventTypes(tx)).toContain('tool.requested');
    // 不置 succeeded
    expect(tx.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'queued' }) }),
    );
    // model_call 步骤已 succeeded 且带 toolCalls（供回喂重建）
    const stepUpdate = tx.runStep.update.mock.calls.find(
      (call) => call[0].data?.status === 'succeeded',
    );
    expect(stepUpdate?.[0].data.output).toEqual({
      text: '我来查：',
      toolCalls: [{ id: 'tc_1', name: 'echo', input: { text: '查一下' } }],
    });
  });

  it('does not re-submit a tool already pending in the outbox (idempotent redelivery)', async () => {
    const { runner, tx, outbox } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'running', input: '查一下' },
      {
        startedStep: { id: 'step_1', seq: 1, status: 'started' },
        generateResult: {
          text: '我来查：',
          toolCalls: [{ id: 'tc_1', name: 'echo', input: { text: 'x' } }],
        },
      },
    );
    // outbox 已有同 toolCallId 的 pending 消息（崩溃续跑场景）
    tx.outboxEvent.findMany.mockResolvedValue([
      {
        payload: {
          version: 1,
          runId: 'run_1',
          userId: 'user_1',
          toolCall: { id: 'tc_1', name: 'echo', input: { text: 'x' } },
        },
      },
    ]);

    const result = await runner.execute(job);

    expect(result.status).toBe('succeeded');
    expect(outbox.enqueueToolRequested).not.toHaveBeenCalled();
    expect(eventTypes(tx)).not.toContain('tool.requested');
    // Run 保持 running（幂等命中时不再改状态）
    expect(tx.agentRun.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'queued' }) }),
    );
  });

  it('rebuilds conversation context from succeeded steps when continuing the loop', async () => {
    const { runner, gateway } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'queued', input: '继续' },
      {
        generateResult: { text: '最终答案', toolCalls: [] },
        historySteps: [
          {
            kind: 'model_call',
            status: 'succeeded',
            input: { prompt: '查一下' },
            output: {
              text: '我来查：',
              toolCalls: [{ id: 'tc_1', name: 'echo', input: { text: '查一下' } }],
            },
          },
          {
            kind: 'tool_call',
            status: 'succeeded',
            input: {
              toolCall: { id: 'tc_1', name: 'echo', input: { text: '查一下' } },
            },
            output: { text: '查一下' },
          },
        ],
      },
    );

    await runner.execute(job);

    expect(gateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', text: '继续' },
          {
            role: 'assistant',
            text: '我来查：',
            toolCalls: [{ id: 'tc_1', name: 'echo', input: { text: '查一下' } }],
          },
          { role: 'tool', toolCallId: 'tc_1', result: { text: '查一下' } },
        ],
      }),
    );
  });

  it('fails the run when the model turn limit is exceeded', async () => {
    const { runner, tx } = createRunner(
      { id: 'run_1', userId: 'user_1', status: 'queued', input: 'hi' },
      {
        generateResult: { text: 'x', toolCalls: [] },
        historySteps: Array.from({ length: 20 }, (_, i) => ({
          kind: 'model_call' as const,
          status: 'succeeded' as const,
          input: { prompt: `turn ${i}` },
          output: { text: 'x', toolCalls: [] },
        })),
      },
    );

    const result = await runner.execute(job);

    expect(result.status).toBe('failed');
    expect(result.retryable).toBe(false);
    expect(result.error).toContain('max_turns_exceeded');
    expect(tx.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
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
      {
        startedStep: { id: 'step_1', seq: 1, status: 'started' },
        generateError: new RetryableError('upstream timeout'),
      },
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
