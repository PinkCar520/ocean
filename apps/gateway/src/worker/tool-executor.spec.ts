import { z } from 'zod';
import type { LeasedRunJob } from '@ocean/contracts';
import { EgressPolicy } from '../sandbox/egress-policy';
import { ToolRegistry } from '../tool/tool.registry';
import { TerminalToolError, ToolExecutor } from './tool-executor';
import { createDeviceTools } from '../tool/device.tools';

function toolJob(
  options: {
    id?: string;
    name?: string;
    idempotencyKey?: string;
    input?: Record<string, unknown>;
  } = {},
): LeasedRunJob {
  return {
    id: options.id ?? 'outbox_t1',
    topic: 'tool.requested',
    payload: {
      version: 1,
      runId: 'run_1',
      userId: 'user_1',
      toolCall: {
        id: 'tc_1',
        name: options.name ?? 'echo',
        input: options.input ?? { text: 'hi' },
        idempotencyKey: options.idempotencyKey,
      },
    },
    attempts: 1,
    lockedAt: '2026-09-15T02:00:00.000Z',
  };
}

function createExecutor(
  options: {
    run?: { id: string; userId: string; status: string } | null;
    startedStep?: { id: string; seq: number; status: string } | null;
    succeededSteps?: Array<{
      status: string;
      input: { idempotencyKey?: string };
    }>;
    approval?: { status: 'pending' | 'approved' | 'rejected'; runId?: string; userId?: string; toolCallId?: string; expiresAt?: Date | null; toolName?: string; args?: Record<string, unknown> } | null;
    toolError?: Error;
  } = {},
) {
  const defaultRun = { id: 'run_1', userId: 'user_1', status: 'queued' };
  const tx = {
    agentRun: {
      findUnique: jest.fn().mockResolvedValue(options.run ?? defaultRun),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    runEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    runStep: {
      findFirst: jest.fn().mockResolvedValue(options.startedStep ?? null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    runApproval: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.approval ? { runId: 'run_1', userId: 'user_1', toolCallId: 'tc_1', expiresAt: new Date(Date.now() + 60000), toolName: 'approval.tool', args: { text: 'hi' }, ...options.approval } : null,
        ),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
    agentRun: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.run === null ? null : (options.run ?? defaultRun),
        ),
    },
    runStep: {
      findMany: jest.fn().mockResolvedValue(options.succeededSteps ?? []),
    },
    runApproval: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.approval ? { runId: 'run_1', userId: 'user_1', toolCallId: 'tc_1', expiresAt: new Date(Date.now() + 60000), toolName: 'approval.tool', args: { text: 'hi' }, ...options.approval } : null,
        ),
    },
  };

  const registry = new ToolRegistry();
  const toolExecute = jest.fn(async (input: Record<string, unknown>) => {
    if (options.toolError !== undefined) throw options.toolError;
    return { ok: true, echo: input };
  });
  registry.register({
    name: 'echo',
    description: 'test tool',
    execute: toolExecute,
  });
  registry.register({
    name: 'approval.tool',
    description: 'approval-required tool',
    requiresApproval: true,
    execute: toolExecute,
  });

  const executor = new ToolExecutor(
    prisma as never,
    registry,
    {
      enqueueRunRequested: jest.fn().mockResolvedValue(undefined),
    } as never,
    { inc: jest.fn() } as never,
    { record: jest.fn().mockResolvedValue({ id: 'a' }) } as never,
  );
  return { executor, tx, prisma, registry, toolExecute };
}

describe('ToolExecutor (Phase 4.4 幂等工具调用 + 失败分类)', () => {
  it.each([
    { expiresAt: new Date(0) },
    { expiresAt: new Date(NaN) },
    { userId: 'other' },
    { runId: 'other' },
    { toolCallId: 'other' },
  ])('rejects expired or corrupt approval %j', async (override) => {
    const { executor, toolExecute } = createExecutor({ approval: { status: 'approved', ...override } });
    expect(await executor.execute(toolJob({ name: 'approval.tool' }))).toMatchObject({ status: 'failed' });
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it('rejects invalid schema input before approval or execution', async () => {
    const { executor, registry, toolExecute, tx } = createExecutor();
    registry.register({ name: 'echo', description: 'validated', inputSchema: z.object({ text: z.string() }), execute: toolExecute });
    expect(await executor.execute(toolJob({ input: { text: 42 } }))).toMatchObject({ status: 'failed', retryable: false });
    expect(toolExecute).not.toHaveBeenCalled();
    expect(tx.runApproval.create).not.toHaveBeenCalled();
  });

  it('does not replay a non-idempotent started operation after restart', async () => {
    const { executor, toolExecute } = createExecutor({
      approval: { status: 'approved' },
      startedStep: { id: 'uncertain', seq: 1, status: 'started' },
    });
    expect(await executor.execute(toolJob({ name: 'approval.tool' }))).toMatchObject({ status: 'failed', retryable: false });
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it('rejects the same idempotency key with different input', async () => {
    const { executor, toolExecute } = createExecutor({ succeededSteps: [
      { status: 'succeeded', input: { idempotencyKey: 'conflict', name: 'echo', input: { text: 'other' } } } as any,
    ] });
    expect(await executor.execute(toolJob({ idempotencyKey: 'conflict' }))).toMatchObject({ status: 'failed', retryable: false });
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it('denies execution even with an approved record when policy denies', async () => {
    const { executor, toolExecute } = createExecutor({ approval: { status: 'approved', toolName: 'echo' } });
    jest.spyOn((executor as any).permissions, 'evaluateTool').mockReturnValue('deny');
    expect(await executor.execute(toolJob())).toMatchObject({ status: 'failed' });
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it('asks for unknown registered tools without an approval flag', async () => {
    const { executor, registry, toolExecute, tx } = createExecutor();
    registry.register({ name: 'unknown.tool', description: 'unknown', execute: toolExecute });
    await executor.execute(toolJob({ name: 'unknown.tool' }));
    expect(toolExecute).not.toHaveBeenCalled();
    expect(tx.runApproval.create).toHaveBeenCalled();
  });

  it('does not create an approval when cancellation wins the state transition', async () => {
    const { executor, tx, toolExecute } = createExecutor();
    tx.agentRun.updateMany.mockResolvedValue({ count: 0 });
    expect(await executor.execute(toolJob({ name: 'approval.tool' }))).toMatchObject({ status: 'succeeded' });
    expect(tx.runApproval.create).not.toHaveBeenCalled();
    expect(toolExecute).not.toHaveBeenCalled();
  });
  it('does not dispatch a tool on a cancelled Run', async () => {
    const { executor, toolExecute, tx } = createExecutor({ run: { id: 'run_1', userId: 'user_1', status: 'cancelled' } });
    expect(await executor.execute(toolJob())).toMatchObject({ status: 'succeeded' });
    expect(toolExecute).not.toHaveBeenCalled();
    expect(tx.agentRun.update).not.toHaveBeenCalled();
  });

  it('does not overwrite a cancellation when an in-flight tool returns', async () => {
    const { executor, toolExecute, tx } = createExecutor();
    toolExecute.mockImplementation(async () => {
      tx.agentRun.findUnique.mockResolvedValue({ id: 'run_1', userId: 'user_1', status: 'cancelled' });
      tx.agentRun.updateMany.mockResolvedValue({ count: 0 });
      return { ok: true, echo: {} };
    });
    await executor.execute(toolJob());
    expect(tx.agentRun.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'succeeded' } }));
    expect(tx.agentRun.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'queued' } }));
  });

  it('requests approval before dispatching a notebook write and preserves tool-call identity after approval', async () => {
    const broker = { request: jest.fn().mockResolvedValue({ path: 'n.ipynb', mode: 'replace' }) };
    const pending = createExecutor();
    for (const tool of createDeviceTools(broker as never)) pending.registry.register(tool);
    const job = toolJob({ name: 'local_notebook_edit', idempotencyKey: 'notebook-1', input: { path: 'n.ipynb', cell_id: 'c1', new_source: 'x' } });
    await pending.executor.execute(job);
    expect(pending.tx.runApproval.create).toHaveBeenCalled();
    expect(broker.request).not.toHaveBeenCalled();
    const approved = createExecutor({ approval: { status: 'approved', toolName: 'local_notebook_edit', args: { path: 'n.ipynb', cell_id: 'c1', new_source: 'x' } } });
    for (const tool of createDeviceTools(broker as never)) approved.registry.register(tool);
    await approved.executor.execute(job);
    expect(broker.request).toHaveBeenCalledWith('notebook_edit', { path: 'n.ipynb', mode: 'replace', cell_id: 'c1', new_source: 'x' }, { runId: 'run_1', userId: 'user_1', toolCallId: 'tc_1' });
  });

  it.each([
    ['local_file_write', 'file_write', { path: 'a.txt', content: 'new' }],
    ['local_file_edit', 'file_edit', { path: 'a.txt', old_string: 'old', new_string: 'new' }],
    ['local_file_patch', 'file_patch', { path: 'a.txt', edits: [{ old_string: 'old', new_string: 'new' }] }],
  ])('requires matching approval before dispatching %s', async (name, method, input) => {
    const broker = { request: jest.fn().mockResolvedValue({ ok: true }) };
    const job = toolJob({ name, input });
    const pending = createExecutor();
    for (const tool of createDeviceTools(broker as never)) pending.registry.register(tool);
    await pending.executor.execute(job);
    expect(pending.tx.runApproval.create).toHaveBeenCalled();
    expect(broker.request).not.toHaveBeenCalled();
    const approved = createExecutor({ approval: { status: 'approved', toolName: name, args: input } });
    for (const tool of createDeviceTools(broker as never)) approved.registry.register(tool);
    await approved.executor.execute(job);
    expect(broker.request).toHaveBeenCalledWith(method, input, { runId: 'run_1', userId: 'user_1', toolCallId: 'tc_1' });
  });

  it('does not reuse an approval for different tool arguments', async () => {
    const { executor, toolExecute } = createExecutor({ approval: { status: 'approved', args: { text: 'different' } } });
    const result = await executor.execute(toolJob({ name: 'approval.tool' }));
    expect(result).toMatchObject({ status: 'failed', retryable: false, error: expect.stringContaining('does not match') });
    expect(toolExecute).not.toHaveBeenCalled();
  });
  it('executes a tool call: tool_call step + step/tool events + run succeeded', async () => {
    const { executor, tx } = createExecutor();

    const result = await executor.execute(toolJob({ idempotencyKey: 'k1' }));

    expect(result).toEqual({
      jobId: 'outbox_t1',
      runId: 'run_1',
      status: 'succeeded',
    });
    // 步骤：创建 started → 更新 succeeded
    expect(tx.runStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'tool_call', status: 'started' }),
      }),
    );
    expect(tx.runStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
    // 事件序列：running → step_started → step_completed → tool.completed → succeeded
    const eventTypes = tx.runEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload.type,
    );
    expect(eventTypes).toEqual([
      'run.status_changed', // running
      'run.step_started',
      'run.step_completed',
      'tool.completed',
      'run.status_changed', // succeeded
    ]);
    const stepStarted = tx.runEvent.create.mock.calls[1][0].data.payload;
    expect(stepStarted.step).toEqual(
      expect.objectContaining({ kind: 'tool_call', status: 'started' }),
    );
  });

  it('does not replay a write after side effect success and result persistence failure', async () => {
    const first = createExecutor({ approval: { status: 'approved' } });
    first.tx.runStep.update.mockRejectedValueOnce(new Error('database unavailable after side effect'));
    const result = await first.executor.execute(toolJob({ name: 'approval.tool', idempotencyKey: 'side-effect-1' }));
    expect(first.toolExecute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'failed', retryable: false });
    expect(result.error).toContain('result unknown; automatic replay prohibited');

    // Reconstruct a Worker executor with only the durable started step surviving the crash.
    const restarted = createExecutor({ startedStep: { id: 'started-write', seq: 1, status: 'started' }, approval: { status: 'approved' } });
    const replay = await restarted.executor.execute(toolJob({ name: 'approval.tool', idempotencyKey: 'side-effect-1' }));
    expect(replay).toMatchObject({ status: 'failed', retryable: false });
    expect(restarted.toolExecute).not.toHaveBeenCalled();
  });

  it('persists unknown after a side effect whose result cannot be saved', async () => {
    const { executor, tx } = createExecutor({ approval: { status: 'approved' } });
    tx.runStep.update.mockImplementationOnce(async () => {
      tx.runStep.findFirst.mockResolvedValue({ id: 'durable-started', seq: 1, status: 'started' } as any);
      throw new Error('database unavailable');
    });
    await executor.execute(toolJob({ name: 'approval.tool' }));
    expect(tx.runStep.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'unknown' }) }));
  });

  it('rejects key reuse with changed parameters even for unfinished records', async () => {
    const { executor, toolExecute } = createExecutor({ succeededSteps: [
      { status: 'started', input: { idempotencyKey: 'conflict', name: 'echo', input: { text: 'other' } } } as any,
    ] });
    expect(await executor.execute(toolJob({ idempotencyKey: 'conflict' }))).toMatchObject({ status: 'failed', retryable: false });
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it('deduplicates by idempotencyKey: cached success, tool not executed again', async () => {
    const { executor, toolExecute } = createExecutor({
      succeededSteps: [
        { status: 'succeeded', input: { idempotencyKey: 'k1', name: 'echo', input: { text: 'hi' } } } as any,
      ],
    });

    const result = await executor.execute(toolJob({ idempotencyKey: 'k1' }));

    expect(result).toEqual(
      expect.objectContaining({ status: 'succeeded', cached: true }),
    );
    // 外部副作用不再发生（K4：相同幂等键不重复外部写）
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it('reuses a started step on crash resume without duplicate step_started', async () => {
    const { executor, tx } = createExecutor({
      startedStep: { id: 'step_1', seq: 1, status: 'started' },
    });

    const result = await executor.execute(toolJob({ idempotencyKey: 'k1' }));

    expect(result.status).toBe('succeeded');
    expect(tx.runStep.create).not.toHaveBeenCalled();
    const eventTypes = tx.runEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload.type,
    );
    expect(eventTypes).not.toContain('run.step_started');
    // 复用 step_1 并置 succeeded
    expect(tx.runStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step_1' },
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
  });

  it('fails terminally for an unknown tool (no retry)', async () => {
    const { executor, tx } = createExecutor();

    const result = await executor.execute(toolJob({ name: 'missing.tool' }));

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        retryable: false,
        error: 'Unknown tool: missing.tool',
      }),
    );
    // run → failed + run.failed 事件
    expect(tx.agentRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
    const eventTypes = tx.runEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload.type,
    );
    expect(eventTypes).toContain('run.failed');
    expect(eventTypes).not.toContain('run.status_changed');
  });

  it('treats a TerminalToolError as terminal business failure (no retry)', async () => {
    const { executor, tx } = createExecutor({
      toolError: new TerminalToolError('permission denied'),
    });

    const result = await executor.execute(toolJob());

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        retryable: false,
        error: 'permission denied',
      }),
    );
    expect(tx.agentRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('treats an unexpected tool error as retryable (run back to queued)', async () => {
    const { executor, tx } = createExecutor({
      startedStep: { id: 'step_1', seq: 1, status: 'started' },
      toolError: new Error('upstream timeout'),
    });

    const result = await executor.execute(toolJob());

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        retryable: true,
        error: 'upstream timeout',
      }),
    );
    // run → queued，消息退避重试
    expect(tx.agentRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'queued' }),
      }),
    );
    // started 步骤被置 failed
    const stepFailed = tx.runStep.update.mock.calls.find(
      (call) => call[0].data?.status === 'failed',
    );
    expect(stepFailed).toBeDefined();
  });

  it('creates an approval step + runApproval and parks the run in waiting_for_approval (Phase 4.5)', async () => {
    const { executor, tx, toolExecute } = createExecutor();

    const result = await executor.execute(
      toolJob({ name: 'approval.tool', idempotencyKey: 'k_app' }),
    );

    // 消息确认（processed），工具不执行
    expect(result).toEqual(expect.objectContaining({ status: 'succeeded' }));
    expect(toolExecute).not.toHaveBeenCalled();
    // 创建了 approval 步骤（kind=approval）+ RunApproval(pending)
    expect(tx.runStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'approval', status: 'started' }),
      }),
    );
    expect(tx.runApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolCallId: 'tc_1',
          toolName: 'approval.tool',
        }),
      }),
    );
    // Run → waiting_for_approval + approval.requested 事件
    expect(tx.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'waiting_for_approval' }),
      }),
    );
    const eventTypes = tx.runEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload.type,
    );
    expect(eventTypes).toContain('approval.requested');
    expect(eventTypes).toContain('run.status_changed');
  });

  it('resumes from an approved approval: executes the tool without re-creating the approval (Phase 4.5)', async () => {
    const { executor, tx, toolExecute } = createExecutor({
      approval: { status: 'approved' },
    });

    const result = await executor.execute(
      toolJob({ name: 'approval.tool', idempotencyKey: 'k_app' }),
    );

    expect(result).toEqual(expect.objectContaining({ status: 'succeeded' }));
    // 审批已通过 → 执行工具（续跑），不再创建审批
    expect(toolExecute).toHaveBeenCalledTimes(1);
    expect(tx.runApproval.create).not.toHaveBeenCalled();
    expect(tx.runStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'tool_call', status: 'started' }),
      }),
    );
    expect(tx.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
  });

  it('does not duplicate the approval on crash redelivery while still pending (Phase 4.5)', async () => {
    const { executor, tx, toolExecute } = createExecutor({
      approval: { status: 'pending' },
    });

    const result = await executor.execute(
      toolJob({ name: 'approval.tool', idempotencyKey: 'k_app' }),
    );

    expect(result).toEqual(expect.objectContaining({ status: 'succeeded' }));
    expect(toolExecute).not.toHaveBeenCalled();
    expect(tx.runApproval.create).not.toHaveBeenCalled();
    expect(tx.runStep.create).not.toHaveBeenCalled();
  });

  it('does not execute a rejected approval (run already cancelled by decision endpoint) (Phase 4.5)', async () => {
    const { executor, toolExecute } = createExecutor({
      approval: { status: 'rejected' },
    });

    const result = await executor.execute(
      toolJob({ name: 'approval.tool', idempotencyKey: 'k_app' }),
    );

    expect(result).toEqual(expect.objectContaining({ status: 'succeeded' }));
    expect(toolExecute).not.toHaveBeenCalled();
  });

  it('rejects web.get for an unlisted host as terminal egress denial (Phase 4.7)', async () => {
    // 空 allowlist（默认拒绝）——web.get 对任意域都拒
    const registry = new ToolRegistry(new EgressPolicy([]));
    const tx = {
      agentRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'run_1',
          userId: 'user_1',
          status: 'queued',
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      runEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      runStep: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      runApproval: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      agentRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'run_1',
          userId: 'user_1',
          status: 'queued',
        }),
      },
      runStep: { findMany: jest.fn().mockResolvedValue([]) },
      runApproval: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const executor = new ToolExecutor(
      prisma as never,
      registry,
      {
        enqueueRunRequested: jest.fn().mockResolvedValue(undefined),
      } as never,
      { inc: jest.fn() } as never,
      { record: jest.fn().mockResolvedValue({ id: 'a' }) } as never,
    );

    const result = await executor.execute(
      toolJob({
        name: 'web.get',
        input: { url: 'https://evil.example.net/leak' },
        idempotencyKey: 'k_web',
      }),
    );

    // 终态失败、不可重试、错误消息含 host 与原因（可审计）
    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        retryable: false,
        error: expect.stringContaining('egress_denied: evil.example.net'),
      }),
    );
    expect(tx.agentRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
    const eventTypes = tx.runEvent.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { payload: { type: string } } }).data.payload.type,
    );
    expect(eventTypes).toContain('run.failed');
  });
});
