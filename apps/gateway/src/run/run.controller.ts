import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  approvalDecisionSchema,
  createRunRequestSchema,
  toolCallSchema,
} from '@ocean/contracts';

import { ArtifactStore } from '../artifact/artifact.store';
import { RunService } from './run.service';

@Controller('api/runs')
export class RunController {
  constructor(
    private readonly runService: RunService,
    private readonly artifactStore: ArtifactStore,
  ) {}

  /**
   * POST /api/runs/:id/retry
   * 重新执行已失败/取消/暂停的 Run（产品级重试入口）。
   */
  @Post(':id/retry')
  retry(@Param('id') id: string, @Req() request: any) {
    return this.runService.retry(id, this.userId(request));
  }

  /**
   * POST /api/runs/:id/resume
   * 恢复暂停/等待输入的 Run（产品级续跑入口；审批续跑走 approve/decide）。
   */
  @Post(':id/resume')
  resume(@Param('id') id: string, @Req() request: any) {
    return this.runService.resume(id, this.userId(request));
  }

  /**
   * GET /api/runs/:id/artifacts/:artifactId
   * 读取 Run 产物内容（Phase 4 第 8 项：artifact 存储分离）。
   * 内容在 ArtifactStore（本地对象存储），DB 只存引用——此端点按引用流式返回。
   */
  @Get(':id/artifacts/:artifactId')
  async artifact(
    @Param('id') id: string,
    @Param('artifactId') artifactId: string,
    @Req() request: any,
    @Res() response: Response,
  ) {
    const userId = this.userId(request);
    await this.runService.getStatus(id, userId); // 归属校验（404/403）
    try {
      const content = await this.artifactStore.load(id, artifactId);
      response.setHeader('Content-Type', 'application/octet-stream');
      response.send(content);
    } catch {
      throw new NotFoundException(
        `Artifact ${artifactId} not found for run ${id}`,
      );
    }
  }

  @Post()
  create(@Body() body: unknown, @Req() request: any) {
    const parsed = createRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid run request',
        issues: parsed.error.issues,
      });
    }
    return this.runService.create(this.userId(request), parsed.data);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() request: any) {
    return this.runService.get(id, this.userId(request));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() request: any) {
    return this.runService.cancel(id, this.userId(request));
  }

  /**
   * POST /api/runs/:id/tool-calls
   * 提交工具调用请求（Phase 4 第 4 项）。body 为 toolCallSchema：
   * { id, name, input, idempotencyKey? }。
   * 相同 idempotencyKey 的重复投递由 Worker 幂等执行（不产生二次外部写）。
   */
  @Post(':id/tool-calls')
  createToolCall(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: any,
  ) {
    const parsed = toolCallSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid tool call',
        issues: parsed.error.issues,
      });
    }
    return this.runService.createToolCall(
      id,
      this.userId(request),
      parsed.data,
    );
  }

  /**
   * POST /api/runs/:id/approvals/:approvalId/decide
   * 审批决策（Phase 4 第 5 项：审批/交互续跑）。body 为 approvalDecisionSchema：
   * { decision: 'approved' | 'rejected' }。
   * approved → Run 重新投递 tool.requested 从检查点续跑；rejected → Run cancelled。
   */
  @Post(':id/approvals/:approvalId/decide')
  decideApproval(
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @Body() body: unknown,
    @Req() request: any,
  ) {
    const parsed = approvalDecisionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid approval decision',
        issues: parsed.error.issues,
      });
    }
    return this.runService.decideApproval(
      id,
      approvalId,
      this.userId(request),
      parsed.data.decision,
    );
  }

  /**
   * GET /api/runs/:id/steps
   * 步骤明细（model_call/tool_call/approval 的落库记录），供前端展示执行轨迹。
   */
  @Get(':id/steps')
  steps(@Param('id') id: string, @Req() request: any) {
    return this.runService.listSteps(id, this.userId(request));
  }

  /**
   * GET /api/runs/:id/events?after=<sequence>
   * SSE 事件投影（对应 worker-design-reference.md 5.3 订阅恢复）：
   * - 断点续读：query `after` 或 HTTP 头 `Last-Event-ID`（EventSource 重连自动携带）
   *   决定从哪个 sequence 之后回放，服务端只返回 sequence 严格更大的事件 →
   *   重连无重复、无丢失。
   * - 每条事件带 SSE `id:` 字段，EventSource 自动记录 lastEventId。
   * - `retry: 1000` 让浏览器断线 1s 后自动重连；`: ping` 注释行心跳防代理超时。
   * - Run 到达终态（succeeded/failed/cancelled）且事件已回放完 → 发 `event: done` 后关闭。
   */
  @Get(':id/events')
  async streamEvents(
    @Param('id') id: string,
    @Req() request: any,
    @Res() response: Response,
    @Query('after') after?: string,
  ) {
    const userId = this.userId(request);
    let afterSeq: number | undefined;
    const lastEventIdHeader = request.headers['last-event-id'];
    const afterSource =
      after !== undefined
        ? after
        : typeof lastEventIdHeader === 'string'
          ? lastEventIdHeader
          : undefined;

    if (afterSource !== undefined) {
      afterSeq = Number(afterSource);
      if (!Number.isInteger(afterSeq) || afterSeq < 0) {
        throw new BadRequestException(
          'after must be a non-negative integer sequence',
        );
      }
    }

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    response.write(`retry: 1000\n\n`);

    let lastSeq = afterSeq ?? -1;
    const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
    const handles: { timer?: NodeJS.Timeout; heartbeat?: NodeJS.Timeout } = {};
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      if (handles.timer) clearInterval(handles.timer);
      if (handles.heartbeat) clearInterval(handles.heartbeat);
      response.write(`event: done\ndata: {}\n\n`);
      response.end();
    };

    const send = (events: Array<{ sequence: number }>) => {
      for (const event of events) {
        response.write(
          `id: ${event.sequence}\nevent: run\ndata: ${JSON.stringify(event)}\n\n`,
        );
        lastSeq = event.sequence;
      }
    };

    const poll = async () => {
      try {
        const next = await this.runService.listEvents(id, userId, lastSeq);
        if (next.length > 0) send(next);
        const status = await this.runService.getStatus(id, userId);
        if (TERMINAL_STATUSES.has(status)) close();
      } catch {
        close();
      }
    };

    try {
      await poll(); // 首次回放 + 终态检测（若 after 已是最后事件，直接 done）
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      response.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      response.end();
      return;
    }

    // 首轮回放已到终态（close 已触发）→ 不再创建轮询/心跳 timer
    if (closed) return;

    handles.timer = setInterval(poll, 2000);
    handles.heartbeat = setInterval(() => {
      if (!closed) response.write(`: ping\n\n`);
    }, 15000);

    response.on('close', close);
  }

  private userId(request: any): string {
    const userId = request.user?.dbId;
    if (!userId)
      throw new UnauthorizedException(
        'Authenticated database user is required',
      );
    return userId;
  }
}
