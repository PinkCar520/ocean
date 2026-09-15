import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RunController } from './run.controller';

function createController() {
  const runService = {
    listEvents: jest.fn(),
    getStatus: jest.fn(),
  };
  const artifactStore = {
    load: jest.fn().mockResolvedValue('content'),
  };
  const controller = new RunController(
    runService as never,
    artifactStore as never,
  );
  return { controller, runService, artifactStore };
}

function createResponse() {
  const res: any = {
    chunks: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    closeHandler: undefined as (() => void) | undefined,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    flushHeaders() {},
    write(chunk: string) {
      this.chunks.push(chunk);
    },
    end() {
      this.ended = true;
    },
    on(_event: string, handler: () => void) {
      this.closeHandler = handler;
    },
  };
  return res;
}

describe('RunController SSE streamEvents (Phase 4.3 订阅恢复)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('回放事件并带 SSE id/retry 字段，终态后发 done 关闭', async () => {
    const { controller, runService } = createController();
    const res = createResponse();
    runService.listEvents.mockResolvedValueOnce([
      { sequence: 0, type: 'run.created', status: 'queued' },
      { sequence: 1, type: 'run.status_changed', status: 'succeeded' },
    ]);
    runService.getStatus.mockResolvedValueOnce('succeeded');

    await controller.streamEvents(
      'run_1',
      { user: { dbId: 'u1' }, headers: {} },
      res,
    );

    const all = res.chunks.join('');
    // 协议要素：retry 提示 + 每条事件带 id 字段
    expect(all).toContain('retry: 1000');
    expect(all).toContain('id: 0\nevent: run\ndata:');
    expect(all).toContain('id: 1\nevent: run\ndata:');
    expect(all).toContain('event: done');
    expect(res.ended).toBe(true);
    // 断点：首次订阅 after 缺省 → -1（全量回放）
    expect(runService.listEvents).toHaveBeenCalledWith('run_1', 'u1', -1);
    res.closeHandler?.();
  });

  it('query after 优先于 Last-Event-ID 头', async () => {
    const { controller, runService } = createController();
    const res = createResponse();
    runService.listEvents.mockResolvedValueOnce([{ sequence: 4 }]);
    runService.getStatus.mockResolvedValueOnce('failed');

    await controller.streamEvents(
      'run_1',
      { user: { dbId: 'u1' }, headers: { 'last-event-id': '9' } },
      res,
      '4',
    );

    // query after=4 生效，Last-Event-ID=9 被忽略
    expect(runService.listEvents).toHaveBeenCalledWith('run_1', 'u1', 4);
    res.closeHandler?.();
  });

  it('断线重连：浏览器带 Last-Event-ID 头，从断点续读（after 缺省）', async () => {
    const { controller, runService } = createController();
    const res = createResponse();
    runService.listEvents.mockResolvedValueOnce([{ sequence: 5 }]);
    runService.getStatus.mockResolvedValueOnce('running');

    await controller.streamEvents(
      'run_1',
      { user: { dbId: 'u1' }, headers: { 'last-event-id': '4' } },
      res,
    );

    // 只回放 sequence>4 的事件 → 无重复
    expect(runService.listEvents).toHaveBeenCalledWith('run_1', 'u1', 4);
    expect(res.chunks.join('')).toContain('id: 5\nevent: run');
    // 非终态：不发送 done，保持连接
    expect(res.ended).toBe(false);
    res.closeHandler?.();
  });

  it('非终态连接持续轮询，直到终态才关闭', async () => {
    const { controller, runService } = createController();
    const res = createResponse();
    runService.listEvents.mockResolvedValueOnce([]);
    runService.getStatus.mockResolvedValueOnce('running');
    // 轮询第二次：run 已 succeeded
    runService.listEvents.mockResolvedValueOnce([
      { sequence: 2, type: 'run.status_changed', status: 'succeeded' },
    ]);
    runService.getStatus.mockResolvedValueOnce('succeeded');

    await controller.streamEvents(
      'run_1',
      { user: { dbId: 'u1' }, headers: {} },
      res,
    );
    expect(res.ended).toBe(false);

    await jest.advanceTimersByTimeAsync(2000); // 触发一次轮询
    expect(res.chunks.join('')).toContain('id: 2\nevent: run');
    expect(res.chunks.join('')).toContain('event: done');
    expect(res.ended).toBe(true);
  });

  it('拒绝非法 after 值', async () => {
    const { controller } = createController();
    const res = createResponse();
    await expect(
      controller.streamEvents(
        'run_1',
        { user: { dbId: 'u1' }, headers: {} },
        res,
        '-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.streamEvents(
        'run_1',
        { user: { dbId: 'u1' }, headers: {} },
        res,
        'abc',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RunController artifact endpoint (Phase 4.8 artifact 存储分离)', () => {
  it('归属校验通过后从 ArtifactStore 读出内容并返回', async () => {
    const { controller, runService, artifactStore } = createController();
    runService.getStatus.mockResolvedValue('succeeded');
    artifactStore.load.mockResolvedValue('ART_CONTENT');
    const res: any = { headers: {}, sent: '' };
    res.setHeader = (k: string, v: string) => {
      res.headers[k] = v;
    };
    res.send = (c: string) => {
      res.sent = c;
    };

    await controller.artifact('run_1', 'art_1', { user: { dbId: 'u1' } }, res);

    expect(runService.getStatus).toHaveBeenCalledWith('run_1', 'u1');
    expect(artifactStore.load).toHaveBeenCalledWith('run_1', 'art_1');
    expect(res.sent).toBe('ART_CONTENT');
    expect(res.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('加载失败（不存在/跨 run）→ NotFoundException', async () => {
    const { controller, artifactStore } = createController();
    artifactStore.load.mockRejectedValue(new Error('not found'));

    await expect(
      controller.artifact(
        'run_1',
        'art_x',
        { user: { dbId: 'u1' } },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
