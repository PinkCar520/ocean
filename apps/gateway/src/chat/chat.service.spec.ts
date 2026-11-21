import { ChatService } from './chat.service';

function configOf(value: string | undefined) {
  return {
    get: jest.fn((key: string, fallback?: string) => value ?? fallback),
  } as never;
}

function runServiceMock() {
  const eventsByRun = new Map<string, any[]>();
  const statusByRun = new Map<string, string>();
  return {
    _eventsByRun: eventsByRun,
    _statusByRun: statusByRun,
    create: jest.fn(async (userId: string, request: any) => {
      const runId = `run_${eventsByRun.size + 1}`;
      statusByRun.set(runId, 'queued');
      eventsByRun.set(runId, [
        {
          id: `ev0_${runId}`,
          runId,
          sequence: 0,
          occurredAt: new Date().toISOString(),
          type: 'run.created',
          status: 'queued',
        },
      ]);
      return {
        run: {
          id: runId,
          status: 'queued',
          userId,
          spaceId: request.space.id,
          spaceType: request.space.type,
          input: request.input,
          priority: request.priority,
          metadata: request.metadata ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        events: [...(eventsByRun.get(runId) ?? [])],
      };
    }),
    listEvents: jest.fn(
      async (runId: string, _userId: string, after?: number) => {
        const all = eventsByRun.get(runId) ?? [];
        return all.filter((e) => e.sequence > (after ?? -1));
      },
    ),
    getStatus: jest.fn(
      async (runId: string) => statusByRun.get(runId) ?? 'queued',
    ),
  } as never;
}

describe('ChatService.runChatStream (Run 驱动聊天转译)', () => {
  it('isRunMode 默认开启，仅 CHAT_USE_RUN=false 关闭', () => {
    expect(
      new ChatService(configOf(undefined), runServiceMock()).isRunMode(),
    ).toBe(true);
    expect(
      new ChatService(configOf('false'), runServiceMock()).isRunMode(),
    ).toBe(false);
    expect(
      new ChatService(configOf('true'), runServiceMock()).isRunMode(),
    ).toBe(true);
  });

  it('创建 Run 并把 output_delta 转换为标准 UI message chunks', async () => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const chunks: unknown[] = [];
    const promise = service.runChatStream(
      [{ role: 'user', parts: [{ type: 'text', text: '你好' }] }],
      { userId: 'u1', userMessage: '你好', search: true },
      'model-x',
      'session_1',
      (c) => chunks.push(c),
    );
    // 注入 output_delta + succeeded 事件，让轮询收敛
    const runId = 'run_1';
    const base = {
      id: 'e1',
      runId,
      sequence: 1,
      occurredAt: new Date().toISOString(),
    };
    run._eventsByRun
      .get(runId)
      .push({ ...base, type: 'run.output_delta', delta: '你好，' });
    run._eventsByRun.get(runId).push({
      ...base,
      id: 'e2',
      sequence: 2,
      type: 'run.output_delta',
      delta: '世界',
    });
    run._eventsByRun.get(runId).push({
      ...base,
      id: 'e3',
      sequence: 3,
      type: 'run.status_changed',
      status: 'succeeded',
    });
    run._statusByRun.set(runId, 'succeeded');
    await expect(promise).resolves.toBe('你好，世界');

    expect(run.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        space: { id: 'work', type: 'work' },
        priority: 'interactive',
        metadata: { sessionId: 'session_1', modelId: 'model-x' },
      }),
    );
    expect(run.create.mock.calls[0][1].input).toContain('user: 你好');
    expect(run.create.mock.calls[0][1].input).toContain(
      '[context] search: on | model: model-x',
    );
    expect(chunks).toEqual([
      { type: 'start' },
      { type: 'text-start', id: 'run-output' },
      { type: 'text-delta', id: 'run-output', delta: '你好，' },
      { type: 'text-delta', id: 'run-output', delta: '世界' },
      { type: 'text-end', id: 'run-output' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('streams a pending file approval and clears it when the Run resumes', async () => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const chunks: unknown[] = [];
    const pending = service.runChatStream([{ role: 'user', content: 'edit' }],
      { userId: 'u1' }, 'model-x', 'session', chunk => chunks.push(chunk));
    const runId = 'run_1';
    const toolCall = { id: 'patch', name: 'local_file_patch', input: { path: 'demo.tsx' } };
    const events = [
      { type: 'run.output_delta', delta: 'Found file' },
      { type: 'tool.requested', toolCall },
      { type: 'run.status_changed', status: 'waiting_for_approval' },
      { type: 'approval.requested', approval: { id: 'approval', toolCallId: 'patch', status: 'pending' } },
      { type: 'run.status_changed', status: 'queued' },
      { type: 'run.output_delta', delta: 'Edited' },
      { type: 'run.status_changed', status: 'succeeded' },
    ];
    run._eventsByRun.get(runId).push(...events.map((event, index) => ({ ...event, sequence: index + 1 })));
    await expect(pending).resolves.toBe('Found fileEdited');
    expect(chunks).toEqual([
      { type: 'start' },
      { type: 'text-start', id: 'run-output' },
      { type: 'text-delta', id: 'run-output', delta: 'Found file' },
      { type: 'text-end', id: 'run-output' },
      { type: 'data-run-approval', transient: true, data: { id: 'approval', runId, toolName: toolCall.name, args: toolCall.input } },
      { type: 'data-run-approval', transient: true, data: null },
      { type: 'text-start', id: 'run-output' },
      { type: 'text-delta', id: 'run-output', delta: 'Edited' },
      { type: 'text-end', id: 'run-output' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('ctx.spaceId 透传：Run 归属当前 Space（Phase 6 6b）', async () => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const promise = service.runChatStream(
      [{ role: 'user', content: 'hi' }],
      { userId: 'u1', userMessage: 'hi', search: false, spaceId: 'life-u1' },
      'model-x',
      undefined,
      () => {},
    );
    const runId = 'run_1';
    const base = {
      id: 'e1',
      runId,
      sequence: 1,
      occurredAt: new Date().toISOString(),
    };
    run._eventsByRun
      .get(runId)
      .push({ ...base, type: 'run.output_delta', delta: 'ok' });
    run._eventsByRun.get(runId).push({
      ...base,
      id: 'e2',
      sequence: 2,
      type: 'run.status_changed',
      status: 'succeeded',
    });
    run._statusByRun.set(runId, 'succeeded');
    await promise;

    expect(run.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        space: { id: 'life-u1', type: 'work' },
      }),
    );
  });

  it.each([
    [
      { type: 'run.status_changed', status: 'failed' },
      'Run failed. See gateway logs for details.',
    ],
    [
      { type: 'run.failed', code: 'tool_execution_failed', message: 'Local permission policy denied this device operation.' },
      'Local permission policy denied this device operation.',
    ],
  ])('失败事件 %j 立即结束聊天流', async (event, errorText) => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const chunks: unknown[] = [];
    const promise = service.runChatStream(
      [],
      { userId: 'u1' },
      undefined,
      undefined,
      (c) => chunks.push(c),
    );
    const runId = 'run_1';
    const base = {
      id: 'e1',
      runId,
      sequence: 1,
      occurredAt: new Date().toISOString(),
    };
    run._eventsByRun
      .get(runId)
      .push({ ...base, ...event });
    run._statusByRun.set(runId, 'failed');
    await promise;
    expect(chunks).toEqual([
      { type: 'start' },
      { type: 'error', errorText },
      { type: 'finish', finishReason: 'error' },
    ]);
  });

  it('cancelled 终态以 interrupted reason 结束', async () => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const chunks: unknown[] = [];
    const promise = service.runChatStream(
      [],
      { userId: 'u1' },
      undefined,
      undefined,
      (c) => chunks.push(c),
    );
    const runId = 'run_1';
    const base = {
      id: 'e1',
      runId,
      sequence: 1,
      occurredAt: new Date().toISOString(),
    };
    run._eventsByRun
      .get(runId)
      .push({ ...base, type: 'run.status_changed', status: 'cancelled' });
    run._statusByRun.set(runId, 'cancelled');
    await promise;
    expect(chunks).toEqual([
      { type: 'start' },
      { type: 'finish', finishReason: 'interrupted' },
    ]);
  });
});
