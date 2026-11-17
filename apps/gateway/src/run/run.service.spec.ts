import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { RunService } from './run.service';

describe('RunService', () => {
  const runs = new Map<string, any>();
  const events = new Map<string, any[]>();
  const approvals = new Map<string, any>();
  const steps = new Map<string, any>();
  let nextRun = 1;

  function seedApproval(opts: {
    runId: string;
    status: string;
    stepInput?: any;
    sessionId?: string;
    scope?: string;
    policyVersion?: string;
    argsHash?: string;
  }) {
    const id = `appr_${nextRun}`;
    if (opts.status === 'pending' && runs.has(opts.runId)) runs.get(opts.runId).status = 'waiting_for_approval';
    const step = {
      id,
      runId: opts.runId,
      seq: 2,
      kind: 'approval',
      status: 'started',
      input: opts.stepInput ?? null,
      startedAt: new Date('2026-09-15T03:00:00.000Z'),
    };
    steps.set(id, step);
    approvals.set(id, {
      id,
      runId: opts.runId,
      userId: 'user_1',
      toolCallId: 'tc_1',
      toolName: 'notify.send',
      args: { to: 'alice' },
      status: opts.status,
      scope: opts.scope ?? 'once',
      policyVersion: opts.policyVersion ?? null,
      policyRuleId: null,
      argsHash: opts.argsHash ?? null,
      sessionId: opts.sessionId ?? null,
      expiresAt: new Date(Date.now() + 60000),
      decidedBy: null,
      decidedAt: null,
    });
    return id;
  }

  const agentRun = {
    findUnique: jest.fn(async ({ where, include }: any) => {
      let run = where.id ? runs.get(where.id) : undefined;
      if (where.userId_idempotencyKey) {
        run = [...runs.values()].find(
          (item) =>
            item.userId === where.userId_idempotencyKey.userId &&
            item.idempotencyKey === where.userId_idempotencyKey.idempotencyKey,
        );
      }
      return run && include
        ? { ...run, events: events.get(run.id) ?? [] }
        : (run ?? null);
    }),
    create: jest.fn(async ({ data }: any) => {
      const now = new Date('2026-09-14T04:30:00.000Z');
      const run = {
        id: `run_${nextRun++}`,
        metadata: null,
        idempotencyKey: null,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      runs.set(run.id, run);
      return run;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const run = {
        ...runs.get(where.id),
        ...data,
        updatedAt: new Date('2026-09-14T04:31:00.000Z'),
      };
      runs.set(run.id, run);
      return run;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const run = runs.get(where.id);
      if (!run || (where.userId && run.userId !== where.userId) || (typeof where.status === 'string' && run.status !== where.status) || (where.status?.in && !where.status.in.includes(run.status))) return { count: 0 };
      runs.set(where.id, { ...run, ...data, updatedAt: new Date() });
      return { count: 1 };
    }),
  };
  const runEvent = {
    create: jest.fn(async ({ data }: any) => {
      const row = { ...data };
      events.set(data.runId, [...(events.get(data.runId) ?? []), row]);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const all = events.get(where?.runId) ?? [];
      return all.length > 0
        ? all.reduce((max, e) => (e.sequence > max.sequence ? e : max))
        : null;
    }),
    findMany: jest.fn(async ({ where, orderBy }: any) => {
      const all = events.get(where?.runId) ?? [];
      const filtered =
        where?.sequence?.gt !== undefined
          ? all.filter((e) => e.sequence > where.sequence.gt)
          : all;
      return filtered.sort((a, b) => a.sequence - b.sequence);
    }),
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    agentRun,
    runEvent,
    outboxEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    runApproval: {
      findUnique: jest.fn(async ({ where }: any) => {
        return approvals.get(where.id) ?? null;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        for (const row of approvals.values()) {
          if (where.userId && row.userId !== where.userId) continue;
          if (where.sessionId && row.sessionId !== where.sessionId) continue;
          if (where.toolName && row.toolName !== where.toolName) continue;
          if (where.argsHash && row.argsHash !== where.argsHash) continue;
          if (where.scope && row.scope !== where.scope) continue;
          if (where.policyVersion && row.policyVersion !== where.policyVersion) continue;
          if (where.status && row.status !== where.status) continue;
          if (where.expiresAt?.gt && !(row.expiresAt > where.expiresAt.gt)) continue;
          return row;
        }
        return null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `appr_${nextRun++}`, ...data };
        approvals.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = { ...approvals.get(where.id), ...data };
        approvals.set(row.id, row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [id, row] of approvals) {
          if ((where.id && id !== where.id) || (where.userId && row.userId !== where.userId) || (where.status && row.status !== where.status) || (where.runId !== undefined && (row.runId ?? null) !== where.runId)) continue;
          approvals.set(id, { ...row, ...data });
          count++;
        }
        return { count };
      }),
    },
    runStep: {
      findUnique: jest.fn(async ({ where }: any) => {
        return steps.get(where.id) ?? null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = { ...steps.get(where.id), ...data };
        steps.set(row.id, row);
        return row;
      }),
    },
    $transaction: jest.fn(async (operation: (transaction: any) => unknown) =>
      operation(prisma),
    ),
  };
  const outbox = {
    enqueueRunRequested: jest.fn(async () => undefined),
    enqueueToolRequested: jest.fn(async () => undefined),
  };
  const spaceService = {
    requireAccessibleSpace: jest
      .fn()
      .mockResolvedValue({ id: 'work', type: 'work' }),
  };
  const service = new RunService(
    prisma as never,
    outbox as never,
    spaceService as never,
    {
      save: jest
        .fn()
        .mockResolvedValue({ id: 'art_1', runId: 'run_1', name: 'out.txt' }),
      load: jest.fn(),
    } as never,
    { inc: jest.fn() } as never,
  );

  beforeEach(() => {
    runs.clear();
    events.clear();
    approvals.clear();
    steps.clear();
    nextRun = 1;
    jest.clearAllMocks();
  });

  it('persists a queued run and its first validated event', async () => {
    const snapshot = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'Prepare a report',
    });

    expect(snapshot.run.status).toBe('queued');
    expect(snapshot.events).toMatchObject([
      { type: 'run.created', sequence: 0 },
    ]);
    expect(outbox.enqueueRunRequested).toHaveBeenCalledWith(
      prisma,
      { version: 1, runId: snapshot.run.id, userId: 'user_1' },
      1, // interactive 默认档
    );
  });

  it('resumes a Run when its approval is decided through the shared approval panel endpoint', async () => {
    const snapshot = await service.create('user_1', { space: { id: 'work', type: 'work' }, input: 'edit notebook' });
    const runId = snapshot.run.id;
    runs.get(runId).status = 'waiting_for_approval';
    const toolCall = { id: 'tc_1', name: 'local_notebook_edit', input: { path: 'n.ipynb', cell_id: 'c', new_source: 'x' }, idempotencyKey: 'tc_1' };
    const approvalId = seedApproval({ runId, status: 'pending', stepInput: toolCall });
    const result = await service.decideExternalApproval(approvalId, 'user_1', 'approved');
    expect(result.status).toBe('approved');
    expect(runs.get(runId).status).toBe('queued');
    expect(outbox.enqueueToolRequested).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ runId, userId: 'user_1', toolCall }), expect.any(Number));
  });

  it('stores session scope only for session-scoped approvals', async () => {
    const snapshot = await service.create('user_1', { space: { id: 'work', type: 'work' }, input: 'edit notebook' });
    const runId = snapshot.run.id;
    runs.get(runId).status = 'waiting_for_approval';
    const noSession = seedApproval({ runId, status: 'pending', stepInput: { id: 'tc_1', name: 'local_notebook_edit', input: { path: 'n.ipynb' } } });
    await expect(service.decideApproval(runId, noSession, 'user_1', 'approved', 'session')).rejects.toThrow('session-scoped');
    const withSession = seedApproval({ runId, status: 'pending', sessionId: 'session_1', stepInput: { id: 'tc_2', name: 'local_notebook_edit', input: { path: 'n.ipynb' } } });
    await service.decideApproval(runId, withSession, 'user_1', 'approved', 'session');
    expect(approvals.get(withSession).scope).toBe('session');
  });

  it('looks up an exact unexpired session grant and rejects different arguments', async () => {
    const { createHash } = require('crypto');
    const { canonicalPermissionInput } = require('@ocean/core');
    const args = { to: 'alice' };
    const argsHash = createHash('sha256').update(canonicalPermissionInput(args)).digest('hex');
    const snapshot = await service.create('user_1', { space: { id: 'work', type: 'work' }, input: 'notify' });
    const approvalId = seedApproval({ runId: snapshot.run.id, status: 'approved', sessionId: 'session_1', scope: 'session', argsHash, policyVersion: 'cli-v1' });
    expect(approvalId).toBeDefined();
    await expect(service.lookupSessionGrant('user_1', { sessionId: 'session_1', toolName: 'notify.send', args, policyVersion: 'cli-v1' })).resolves.toEqual({ granted: true });
    await expect(service.lookupSessionGrant('user_1', { sessionId: 'session_1', toolName: 'notify.send', args: { to: 'bob' }, policyVersion: 'cli-v1' })).resolves.toEqual({ granted: false });
    await expect(service.lookupSessionGrant('other', { sessionId: 'session_1', toolName: 'notify.send', args, policyVersion: 'cli-v1' })).resolves.toEqual({ granted: false });
  });

  it('cancels a Run on rejection and refuses another user’s approval decision', async () => {
    const snapshot = await service.create('user_1', { space: { id: 'work', type: 'work' }, input: 'edit notebook' });
    const runId = snapshot.run.id;
    runs.get(runId).status = 'waiting_for_approval';
    const approvalId = seedApproval({ runId, status: 'pending', stepInput: { id: 'tc_1', name: 'local_notebook_edit', input: { path: 'n.ipynb' } } });
    await expect(service.decideExternalApproval(approvalId, 'other', 'approved')).rejects.toThrow('not found');
    const result = await service.decideExternalApproval(approvalId, 'user_1', 'rejected');
    expect(result.status).toBe('rejected');
    expect(runs.get(runId).status).toBe('cancelled');
    expect(outbox.enqueueToolRequested).not.toHaveBeenCalled();
  });

  it('allows only one concurrent Run approval decision and never resumes a cancelled Run', async () => {
    const snapshot = await service.create('user_1', { space: { id: 'work', type: 'work' }, input: 'edit notebook' });
    const runId = snapshot.run.id;
    const approvalId = seedApproval({ runId, status: 'pending', stepInput: { id: 'tc_1', name: 'local_notebook_edit', input: { path: 'n.ipynb' } } });
    await Promise.all([
      service.decideApproval(runId, approvalId, 'user_1', 'approved'),
      service.decideApproval(runId, approvalId, 'user_1', 'rejected'),
    ]);
    expect(approvals.get(approvalId).status).toBe('approved');
    expect(runs.get(runId).status).toBe('queued');
    expect(outbox.enqueueToolRequested).toHaveBeenCalledTimes(1);

    const second = await service.create('user_1', { space: { id: 'work', type: 'work' }, input: 'another' });
    const secondApproval = seedApproval({ runId: second.run.id, status: 'pending' });
    runs.get(second.run.id).status = 'cancelled';
    await service.decideApproval(second.run.id, secondApproval, 'user_1', 'approved');
    expect(runs.get(second.run.id).status).toBe('cancelled');
    expect(outbox.enqueueToolRequested).toHaveBeenCalledTimes(1);
  });

  it('cancels pending approvals and undispatched device requests with the Run', async () => {
    const snapshot = await service.create('user_1', { space: { id: 'work', type: 'work' }, input: 'edit notebook' });
    const runId = snapshot.run.id;
    const approvalId = seedApproval({ runId, status: 'pending' });
    await service.cancel(runId, 'user_1');
    expect(approvals.get(approvalId).status).toBe('rejected');
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ topic: 'device.rpc', aggregateId: runId, status: 'pending' }) }));
    await service.decideApproval(runId, approvalId, 'user_1', 'approved');
    expect(runs.get(runId).status).toBe('cancelled');
    expect(outbox.enqueueToolRequested).not.toHaveBeenCalled();
  });

  it('persists priority and maps critical to outbox rank 0 (Phase 4.6)', async () => {
    const snapshot = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'urgent',
      priority: 'critical',
    });

    expect(snapshot.run.priority).toBe('critical');
    expect(outbox.enqueueRunRequested).toHaveBeenCalledWith(
      prisma,
      { version: 1, runId: snapshot.run.id, userId: 'user_1' },
      0,
    );
  });

  it('returns the existing run for the same user idempotency key', async () => {
    const request = {
      space: { id: 'space_1', type: 'code' as const },
      input: 'Review',
      idempotencyKey: 'request_1',
    };
    const first = await service.create('user_1', request);
    const second = await service.create('user_1', request);

    expect(second.run.id).toBe(first.run.id);
    expect(agentRun.create).toHaveBeenCalledTimes(1);
  });

  it('rejects access from another user', async () => {
    const snapshot = await service.create('user_1', {
      space: { id: 'space_1', type: 'life' },
      input: 'Plan',
    });

    await expect(service.get(snapshot.run.id, 'user_2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('cancels a queued run and appends a sequenced event', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'Prepare',
    });
    const cancelled = await service.cancel(created.run.id, 'user_1');

    expect(cancelled.run.status).toBe('cancelled');
    expect(cancelled.events.at(-1)).toMatchObject({
      type: 'run.status_changed',
      status: 'cancelled',
      sequence: 1,
    });
  });

  it('lists events after a sequence for the owner and rejects other users', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'hi',
    });
    const runningEvent = {
      id: 'evt_2',
      runId: created.run.id,
      sequence: 1,
      occurredAt: '2026-09-15T03:00:00.000Z',
      type: 'run.status_changed',
      status: 'running',
    };
    await runEvent.create({
      data: {
        id: runningEvent.id,
        runId: runningEvent.runId,
        sequence: runningEvent.sequence,
        type: runningEvent.type,
        payload: runningEvent,
        occurredAt: new Date(runningEvent.occurredAt),
      },
    });

    // after=0 → 只回放 sequence>0 的事件（断线续读语义）
    const next = await service.listEvents(created.run.id, 'user_1', 0);
    expect(next.map((e) => e.sequence)).toEqual([1]);
    expect(next[0]).toMatchObject({
      type: 'run.status_changed',
      status: 'running',
    });

    // 缺省 after → 全量
    const all = await service.listEvents(created.run.id, 'user_1');
    expect(all.map((e) => e.sequence)).toEqual([0, 1]);

    // 越权访问被拒
    await expect(
      service.listEvents(created.run.id, 'user_2', 0),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listEvents('missing', 'user_1', 0)).rejects.toThrow(
      /not found/,
    );
  });

  it('enqueues a tool call request for an owned run (Phase 4.4)', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'hi',
    });
    const result = await service.createToolCall(created.run.id, 'user_1', {
      id: 'tc_1',
      name: 'echo',
      input: { text: 'hi' },
      idempotencyKey: 'k1',
    });

    expect(result).toEqual({
      accepted: true,
      runId: created.run.id,
      toolCallId: 'tc_1',
    });
    expect(outbox.enqueueToolRequested).toHaveBeenCalledWith(
      prisma,
      {
        version: 1,
        runId: created.run.id,
        userId: 'user_1',
        toolCall: {
          id: 'tc_1',
          name: 'echo',
          input: { text: 'hi' },
          idempotencyKey: 'k1',
        },
      },
      1,
    );
  });

  it('rejects tool call requests from another user or a missing run', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'hi',
    });
    const toolCall = { id: 'tc_1', name: 'echo', input: { text: 'hi' } };

    await expect(
      service.createToolCall(created.run.id, 'user_2', toolCall),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createToolCall('missing', 'user_1', toolCall),
    ).rejects.toThrow(/not found/);
    expect(outbox.enqueueToolRequested).not.toHaveBeenCalled();
  });

  it('approves a pending approval: run → queued and tool.requested redelivered (Phase 4.5)', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'hi',
    });
    const approvalId = seedApproval({
      runId: created.run.id,
      status: 'pending',
      stepInput: {
        id: 'tc_1',
        name: 'notify.send',
        input: { to: 'alice' },
        idempotencyKey: 'k_app',
      },
    });

    const snapshot = await service.decideApproval(
      created.run.id,
      approvalId,
      'user_1',
      'approved',
    );

    // Run 回到 queued（续跑），审批记录 approved，审批步骤 succeeded + checkpoint
    expect(snapshot.run.status).toBe('queued');
    expect(approvals.get(approvalId).status).toBe('approved');
    expect(approvals.get(approvalId).decidedBy).toBe('user_1');
    const step = steps.get(approvalId);
    expect(step.status).toBe('succeeded');
    expect(step.checkpoint).toMatchObject({ approval: 'approved' });
    // 同一 toolCall（含 idempotencyKey）被重新投递
    expect(outbox.enqueueToolRequested).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        runId: created.run.id,
        userId: 'user_1',
        toolCall: {
          id: 'tc_1',
          name: 'notify.send',
          input: { to: 'alice' },
          idempotencyKey: 'k_app',
        },
      }),
      1,
    );
    // 事件：approval 步骤完成 + run → queued
    const eventTypes = (events.get(created.run.id) ?? []).map(
      (e) => e.payload.type,
    );
    expect(eventTypes).toContain('run.step_completed');
    expect(eventTypes).toContain('run.status_changed');
  });

  it('rejects a pending approval: run → cancelled and nothing redelivered (Phase 4.5)', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'hi',
    });
    const approvalId = seedApproval({
      runId: created.run.id,
      status: 'pending',
      stepInput: {
        id: 'tc_1',
        name: 'notify.send',
        input: { to: 'alice' },
      },
    });

    const snapshot = await service.decideApproval(
      created.run.id,
      approvalId,
      'user_1',
      'rejected',
    );

    expect(snapshot.run.status).toBe('cancelled');
    expect(approvals.get(approvalId).status).toBe('rejected');
    expect(steps.get(approvalId).status).toBe('failed');
    expect(outbox.enqueueToolRequested).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-decided approval (Phase 4.5)', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'hi',
    });
    const approvalId = seedApproval({
      runId: created.run.id,
      status: 'approved',
    });

    const snapshot = await service.decideApproval(
      created.run.id,
      approvalId,
      'user_1',
      'rejected',
    );

    // 已决策 → 幂等返回，不再改状态/不重复投递
    expect(snapshot.run.status).toBe('queued');
    expect(prisma.runApproval.update).not.toHaveBeenCalled();
    expect(outbox.enqueueToolRequested).not.toHaveBeenCalled();
  });

  it('rejects approval decisions from another user or a mismatched approval', async () => {
    const created = await service.create('user_1', {
      space: { id: 'space_1', type: 'work' },
      input: 'hi',
    });
    const approvalId = seedApproval({
      runId: created.run.id,
      status: 'pending',
    });

    await expect(
      service.decideApproval(created.run.id, approvalId, 'user_2', 'approved'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.decideApproval(
        created.run.id,
        'appr_missing',
        'user_1',
        'approved',
      ),
    ).rejects.toThrow(/not found/);
    expect(outbox.enqueueToolRequested).not.toHaveBeenCalled();
  });
});

describe('RunService retry/resume (Phase 3 尾项：resume/retry 产品 API)', () => {
  const runs = new Map<string, any>();
  const events = new Map<string, any[]>();
  let nextRun = 100;
  const agentRun = {
    findUnique: jest.fn(async ({ where, include }: any) => {
      const run = runs.get(where.id) ?? null;
      return run && include
        ? { ...run, events: events.get(run.id) ?? [] }
        : run;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const run = {
        ...runs.get(where.id),
        ...data,
        updatedAt: new Date('2026-09-15T05:00:00.000Z'),
      };
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
    findFirst: jest.fn(async ({ where }: any) => {
      const all = events.get(where?.runId) ?? [];
      return all.length
        ? all.reduce((max, e) => (e.sequence > max.sequence ? e : max))
        : null;
    }),
    findMany: jest.fn(async () => []),
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    agentRun,
    runEvent,
    outboxEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    runApproval: { findUnique: jest.fn(), update: jest.fn() },
    runStep: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (operation: (t: any) => unknown) =>
      operation(prisma),
    ),
  };
  const outbox = {
    enqueueRunRequested: jest.fn(),
    enqueueToolRequested: jest.fn(),
  };
  const spaceService = {
    requireAccessibleSpace: jest
      .fn()
      .mockResolvedValue({ id: 'work', type: 'work' }),
  };
  const service = new RunService(
    prisma as never,
    outbox as never,
    spaceService as never,
    {
      save: jest
        .fn()
        .mockResolvedValue({ id: 'art_1', runId: 'run_1', name: 'out.txt' }),
      load: jest.fn(),
    } as never,
    { inc: jest.fn() } as never,
  );

  function seedRun(status: string, priority = 'interactive') {
    const id = `run_${nextRun++}`;
    const now = new Date('2026-09-15T04:00:00.000Z');
    runs.set(id, {
      id,
      userId: 'user_1',
      spaceId: 'space_1',
      spaceType: 'work',
      input: 'hello',
      status,
      priority,
      idempotencyKey: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    });
    events.set(id, [
      {
        payload: {
          id: `ev_${id}`,
          runId: id,
          sequence: 0,
          type: 'run.created',
          status: 'queued',
          occurredAt: now.toISOString(),
        },
      },
    ]);
    return id;
  }

  beforeEach(() => {
    runs.clear();
    events.clear();
    nextRun = 100;
    jest.clearAllMocks();
    (prisma.outboxEvent.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it('retry 将 failed run 重新入队并投递 run.requested', async () => {
    const id = seedRun('failed');
    const snapshot = await service.retry(id, 'user_1');
    expect(snapshot.run.status).toBe('queued');
    expect(runs.get(id).status).toBe('queued');
    expect(outbox.enqueueRunRequested).toHaveBeenCalledTimes(1);
    const lastEvent = events.get(id)!.at(-1)!;
    expect(lastEvent.type).toBe('run.status_changed');
    expect(lastEvent.payload.status).toBe('queued');
  });

  it('retry 幂等：存在 pending run.requested 时不重复投递', async () => {
    const id = seedRun('failed');
    (prisma.outboxEvent.findFirst as jest.Mock).mockResolvedValue({
      id: 'm1',
      status: 'pending',
    });
    await service.retry(id, 'user_1');
    expect(outbox.enqueueRunRequested).not.toHaveBeenCalled();
  });

  it('retry 拒绝非终态状态（queued / running / succeeded）', async () => {
    await expect(
      service.retry(seedRun('queued'), 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.retry(seedRun('running'), 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.retry(seedRun('succeeded'), 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resume 仅允许 paused / waiting_for_input', async () => {
    await expect(
      service.resume(seedRun('paused'), 'user_1'),
    ).resolves.toMatchObject({ run: { status: 'queued' } });
    await expect(
      service.resume(seedRun('waiting_for_input'), 'user_1'),
    ).resolves.toMatchObject({ run: { status: 'queued' } });
    await expect(
      service.resume(seedRun('waiting_for_approval'), 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resume(seedRun('failed'), 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retry 越权抛 Forbidden', async () => {
    const id = seedRun('failed');
    await expect(service.retry(id, 'other_user')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
