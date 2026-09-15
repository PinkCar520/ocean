import { ChatService } from './chat.service';

function configOf(value: string | undefined) {
  return { get: jest.fn(() => value) } as never;
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
      eventsByRun.set(runId, [{
        id: `ev0_${runId}`, runId, sequence: 0, occurredAt: new Date().toISOString(),
        type: 'run.created', status: 'queued',
      }]);
      return {
        run: { id: runId, status: 'queued', userId, spaceId: request.space.id, spaceType: request.space.type, input: request.input, priority: request.priority, metadata: request.metadata ?? null, createdAt: new Date(), updatedAt: new Date() },
        events: [...(eventsByRun.get(runId) ?? [])],
      };
    }),
    listEvents: jest.fn(async (runId: string, _userId: string, after?: number) => {
      const all = eventsByRun.get(runId) ?? [];
      return all.filter(e => e.sequence > (after ?? -1));
    }),
    getStatus: jest.fn(async (runId: string) => statusByRun.get(runId) ?? 'queued'),
  } as never;
}

describe('ChatService.runChatStream (Run 驱动聊天转译)', () => {
  it('isRunMode 仅在 CHAT_USE_RUN=true 时开启', () => {
    expect(new ChatService(configOf(undefined), runServiceMock()).isRunMode()).toBe(false);
    expect(new ChatService(configOf('false'), runServiceMock()).isRunMode()).toBe(false);
    expect(new ChatService(configOf('true'), runServiceMock()).isRunMode()).toBe(true);
  });

  it('创建 Run（组装 input + 默认 work space）并把 output_delta 转译为 AI SDK 0: 行', async () => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const chunks: string[] = [];
    const promise = service.runChatStream(
      [{ role: 'user', content: '你好' }],
      { userId: 'u1', userMessage: '你好', search: true },
      'model-x',
      'session_1',
      c => chunks.push(c),
    );
    // 注入 output_delta + succeeded 事件，让轮询收敛
    const runId = 'run_1';
    const base = { id: 'e1', runId, sequence: 1, occurredAt: new Date().toISOString() };
    run._eventsByRun.get(runId).push({ ...base, type: 'run.output_delta', delta: '你好，' });
    run._eventsByRun.get(runId).push({ ...base, id: 'e2', sequence: 2, type: 'run.output_delta', delta: '世界' });
    run._eventsByRun.get(runId).push({ ...base, id: 'e3', sequence: 3, type: 'run.status_changed', status: 'succeeded' });
    run._statusByRun.set(runId, 'succeeded');
    await promise;

    expect(run.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      space: { id: 'work', type: 'work' },
      priority: 'interactive',
      metadata: { sessionId: 'session_1', modelId: 'model-x' },
    }));
    expect(run.create.mock.calls[0][1].input).toContain('user: 你好');
    expect(run.create.mock.calls[0][1].input).toContain('[context] search: on | model: model-x');
    expect(chunks).toEqual(['0:"你好，"', '0:"世界"'].map(s => s + '\n'));
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
    const base = { id: 'e1', runId, sequence: 1, occurredAt: new Date().toISOString() };
    run._eventsByRun.get(runId).push({ ...base, type: 'run.output_delta', delta: 'ok' });
    run._eventsByRun.get(runId).push({ ...base, id: 'e2', sequence: 2, type: 'run.status_changed', status: 'succeeded' });
    run._statusByRun.set(runId, 'succeeded');
    await promise;

    expect(run.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      space: { id: 'life-u1', type: 'work' },
    }));
  });

  it('failed 终态输出 AI SDK 3: 错误行', async () => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const chunks: string[] = [];
    const promise = service.runChatStream(
      [],
      { userId: 'u1' },
      undefined,
      undefined,
      c => chunks.push(c),
    );
    const runId = 'run_1';
    const base = { id: 'e1', runId, sequence: 1, occurredAt: new Date().toISOString() };
    run._eventsByRun.get(runId).push({ ...base, type: 'run.status_changed', status: 'failed' });
    run._statusByRun.set(runId, 'failed');
    await promise;
    expect(chunks.join('')).toContain('3:');
    expect(chunks.join('')).toContain('Run failed');
  });

  it('cancelled 终态正常结束（无错误行）', async () => {
    const run = runServiceMock() as any;
    const service = new ChatService(configOf('true'), run);
    const chunks: string[] = [];
    const promise = service.runChatStream([], { userId: 'u1' }, undefined, undefined, c => chunks.push(c));
    const runId = 'run_1';
    const base = { id: 'e1', runId, sequence: 1, occurredAt: new Date().toISOString() };
    run._eventsByRun.get(runId).push({ ...base, type: 'run.status_changed', status: 'cancelled' });
    run._statusByRun.set(runId, 'cancelled');
    await promise;
    expect(chunks).toEqual([]);
  });
});
