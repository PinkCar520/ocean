import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  agentRunSchema,
  runEventSchema,
  runSnapshotSchema,
  toolCallSchema,
  toolRequestedMessageSchema,
  type AgentRun,
  type CreateRunRequest,
  type RunEvent,
  type RunSnapshot,
  type ToolCall,
} from '@ocean/contracts';
import { OutboxService } from './outbox.service';
import { ArtifactStore } from '../artifact/artifact.store';
import { MetricsService } from '../obs/metrics.service';
import { SpaceService } from '../space/space.service';

const CANCELLABLE_STATUSES = new Set([
  'queued',
  'running',
  'waiting_for_approval',
  'waiting_for_input',
  'paused',
]);

/** retry：终态/异常终止后重新执行整个模型步骤。 */
const RETRYABLE_STATUSES = new Set(['failed', 'cancelled', 'paused']);

/** resume：暂停/等待类状态恢复执行（waiting_for_approval 的续跑由审批决策端点处理）。 */
const RESUMABLE_STATUSES = new Set(['paused', 'waiting_for_input']);

@Injectable()
export class RunService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly outbox: OutboxService,
    private readonly spaceService: SpaceService,
    private readonly artifactStore: ArtifactStore,
    private readonly metrics: MetricsService,
  ) {}

  async create(
    userId: string,
    request: CreateRunRequest,
  ): Promise<RunSnapshot> {
    if (request.idempotencyKey) {
      const existing = await this.prisma.agentRun.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: request.idempotencyKey,
          },
        },
      });
      if (existing) return this.get(existing.id, userId);
    }

    // Phase 5：Run 必须归属存在的 Space，且用户可访问（隔离边界）；
    // spaceType 以 Space 表为准（不信任客户端传入的 type，避免与 Space.type 不一致）。
    const spaceRef = await this.spaceService.requireAccessibleSpace(userId, request.space.id);

    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.agentRun.create({
        data: {
          userId,
          spaceId: spaceRef.id,
          spaceType: spaceRef.type,
          input: request.input,
          status: 'queued',
          priority: request.priority ?? 'interactive',
          idempotencyKey: request.idempotencyKey,
          metadata: request.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      const event = runEventSchema.parse({
        id: crypto.randomUUID(),
        runId: run.id,
        sequence: 0,
        occurredAt: run.createdAt.toISOString(),
        type: 'run.created',
        status: 'queued',
      });
      await transaction.runEvent.create({
        data: {
          id: event.id,
          runId: run.id,
          sequence: event.sequence,
          type: event.type,
          payload: event as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
        },
      });
      this.metrics.inc('run.created', { spaceId: run.spaceId });
      this.metrics.inc('run.created', { spaceId: run.spaceId });
      await this.outbox.enqueueRunRequested(
        transaction,
        {
          version: 1,
          runId: run.id,
          userId,
        },
        priorityRankOf(run.priority),
      );
      return runSnapshotSchema.parse({
        run: this.toContract(run),
        events: [event],
      });
    });
  }

  async get(id: string, userId: string): Promise<RunSnapshot> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    if (run.userId !== userId)
      throw new ForbiddenException(`Run ${id} does not belong to current user`);

    return runSnapshotSchema.parse({
      run: this.toContract(run),
      events: run.events.map((event) => runEventSchema.parse(event.payload)),
    });
  }

  /**
   * retry：将 failed/cancelled/paused 的 Run 重新入队执行（Phase 3 尾项：resume/retry 产品 API）。
   * 事务内置 queued + 追加 run.status_changed 事件 + 幂等投递 run.requested
   * （run-runner 重跑时新建 model_call 步骤，失败步骤保留审计）。
   */
  async retry(id: string, userId: string): Promise<RunSnapshot> {
    return this.requeueRun(id, userId, RETRYABLE_STATUSES, 'retry');
  }

  /**
   * resume：将 paused/waiting_for_input 的 Run 恢复入队执行（同上语义）。
   * waiting_for_approval 的续跑走 POST /api/runs/:id/approvals/:approvalId/decide。
   */
  async resume(id: string, userId: string): Promise<RunSnapshot> {
    return this.requeueRun(id, userId, RESUMABLE_STATUSES, 'resume');
  }

  private async requeueRun(
    id: string,
    userId: string,
    allowed: Set<string>,
    action: 'retry' | 'resume',
  ): Promise<RunSnapshot> {
    const snapshot = await this.get(id, userId);
    if (!allowed.has(snapshot.run.status)) {
      throw new BadRequestException(
        `Cannot ${action} run in state '${snapshot.run.status}'`,
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.agentRun.update({
        where: { id },
        data: { status: 'queued' },
      });
      const sequence = snapshot.events.at(-1)?.sequence ?? -1;
      const event = runEventSchema.parse({
        id: crypto.randomUUID(),
        runId: run.id,
        sequence: sequence + 1,
        occurredAt: run.updatedAt.toISOString(),
        type: 'run.status_changed',
        status: 'queued',
      });
      await transaction.runEvent.create({
        data: {
          id: event.id,
          runId: run.id,
          sequence: event.sequence,
          type: event.type,
          payload: event as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
        },
      });
      // 幂等：同 run 已有 pending run.requested 则不重复投递
      const pending = await transaction.outboxEvent.findFirst({
        where: { topic: 'run.requested', aggregateId: run.id, status: 'pending' },
      });
      if (!pending) {
        await this.outbox.enqueueRunRequested(
          transaction,
          {
            version: 1,
            runId: run.id,
            userId,
          },
          priorityRankOf(run.priority),
        );
      }
      return runSnapshotSchema.parse({
        run: this.toContract(run),
        events: [...snapshot.events, event],
      });
    });
  }

  /**
   * 保存 Run 产物（Phase 6 6f 统一 Artifact 闭环）。
   * 归属校验后写入 ArtifactStore，并追加 run.artifact_created 事件
   * （chat 转译为 AI SDK data 事件，前端统一 ArtifactViewer 渲染）。
   */
  async saveArtifact(runId: string, userId: string, name: string, content: string) {
    await this.get(runId, userId); // 404/403 归属校验
    const record = await this.artifactStore.save(runId, name, content);
    // 追加事件（事务内 sequence 续接；事件失败不影响产物已保存）
    const snapshot = await this.get(runId, userId);
    await this.prisma.$transaction(async (transaction) => {
      const sequence = snapshot.events.at(-1)?.sequence ?? -1;
      const event = runEventSchema.parse({
        id: crypto.randomUUID(),
        runId,
        sequence: sequence + 1,
        occurredAt: new Date().toISOString(),
        type: 'artifact.created',
        artifact: {
          id: record.id,
          runId,
          kind: 'run',
          name,
          contentType: 'text/plain; charset=utf-8',
          uri: `/api/runs/${runId}/artifacts/${record.id}`,
          size: record.sizeBytes ?? undefined,
        },
      });
      await transaction.runEvent.create({
        data: {
          id: event.id,
          runId,
          sequence: event.sequence,
          type: event.type,
          payload: event as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
        },
      });
    });
    return record;
  }

  async cancel(id: string, userId: string): Promise<RunSnapshot> {    const snapshot = await this.get(id, userId);
    if (!CANCELLABLE_STATUSES.has(snapshot.run.status)) return snapshot;

    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.agentRun.update({
        where: { id },
        data: { status: 'cancelled' },
      });
      const sequence = snapshot.events.at(-1)?.sequence ?? -1;
      const event = runEventSchema.parse({
        id: crypto.randomUUID(),
        runId: run.id,
        sequence: sequence + 1,
        occurredAt: run.updatedAt.toISOString(),
        type: 'run.status_changed',
        status: 'cancelled',
      });
      await transaction.runEvent.create({
        data: {
          id: event.id,
          runId: run.id,
          sequence: event.sequence,
          type: event.type,
          payload: event as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
        },
      });
      return runSnapshotSchema.parse({
        run: this.toContract(run),
        events: [...snapshot.events, event],
      });
    });
  }

  /**
   * 事件续读（SSE 投影）：返回 sequence > after 的事件。
   * after 缺省返回全部；供 GET /api/runs/:id/events 断点续读（对应设计 5.3）。
   */
  async listEvents(
    id: string,
    userId: string,
    after?: number,
  ): Promise<RunEvent[]> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    if (run.userId !== userId)
      throw new ForbiddenException(`Run ${id} does not belong to current user`);

    const events = await this.prisma.runEvent.findMany({
      where: {
        runId: id,
        ...(after !== undefined ? { sequence: { gt: after } } : {}),
      },
      orderBy: { sequence: 'asc' },
    });
    return events.map((event) => runEventSchema.parse(event.payload));
  }

  /** 步骤详情（RunStep 落库后供前端/CLI 展示与恢复定位）。 */
  async listSteps(id: string, userId: string): Promise<unknown[]> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    if (run.userId !== userId)
      throw new ForbiddenException(`Run ${id} does not belong to current user`);

    return this.prisma.runStep.findMany({
      where: { runId: id },
      orderBy: { seq: 'asc' },
    });
  }

  /** 轻量状态查询：SSE 订阅端用于判断终态后关闭连接。 */
  async getStatus(id: string, userId: string): Promise<string> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    if (run.userId !== userId)
      throw new ForbiddenException(`Run ${id} does not belong to current user`);
    return run.status;
  }

  /** 事件序列：取当前最大 sequence + 1（事务内调用，保证单调且不冲突）。 */
  private async nextRunSequence(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<number> {
    const last = await tx.runEvent.findFirst({
      where: { runId },
      orderBy: { sequence: 'desc' },
    });
    return last ? last.sequence + 1 : 0;
  }

  /**
   * 提交一次工具调用请求（Phase 4 第 4 项：幂等工具调用）。   * 校验 Run 归属后写入 outbox `tool.requested`，由 Worker 的 ToolExecutor
   * 幂等执行：相同 `toolCall.idempotencyKey` 不产生二次外部写操作。
   */
  async createToolCall(
    id: string,
    userId: string,
    toolCall: ToolCall,
  ): Promise<{ accepted: boolean; runId: string; toolCallId: string }> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id },
      select: { id: true, userId: true, priority: true },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    if (run.userId !== userId)
      throw new ForbiddenException(`Run ${id} does not belong to current user`);

    const message = toolRequestedMessageSchema.parse({
      version: 1,
      runId: id,
      userId,
      toolCall: toolCallSchema.parse(toolCall),
    });
    await this.prisma.$transaction(async (transaction) => {
      await this.outbox.enqueueToolRequested(
        transaction,
        message,
        priorityRankOf(run.priority),
      );
    });

    return { accepted: true, runId: id, toolCallId: toolCall.id };
  }

  /**
   * 审批决策（Phase 4 第 5 项：审批/交互续跑）。
   * - approved：审批记录置 approved、approval 步骤 completed，Run → queued，
   *   重新投递 `tool.requested`（同一 toolCall，含 idempotencyKey）→ Worker
   *   从检查点续跑执行工具（幂等键保证不重做已完成的外部写）。
   * - rejected：审批记录置 rejected、Run → cancelled 终态，不投递。
   * 已决策（非 pending）的重复决策幂等返回当前快照。
   */
  async decideApproval(
    runId: string,
    approvalId: string,
    userId: string,
    decision: 'approved' | 'rejected',
  ): Promise<RunSnapshot> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      select: { id: true, userId: true, priority: true },
    });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    if (run.userId !== userId)
      throw new ForbiddenException(`Run ${runId} does not belong to current user`);

    const approval = await this.prisma.runApproval.findUnique({
      where: { id: approvalId },
    });
    if (!approval || approval.runId !== runId)
      throw new NotFoundException(`Approval ${approvalId} not found for run ${runId}`);
    if (approval.status !== 'pending') {
      return this.get(runId, userId); // 幂等：已决策
    }

    await this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const stepRow = await transaction.runStep.findUnique({
        where: { id: approvalId },
      });
      if (!stepRow) {
        throw new Error(`Approval step ${approvalId} not found`);
      }

      await transaction.runApproval.update({
        where: { id: approvalId },
        data: { status: decision, decidedBy: userId, decidedAt: now },
      });

      // approval 步骤收尾（step id = approval id）+ checkpoint（resume 数据基础）
      const stepStatus = decision === 'approved' ? 'succeeded' : 'failed';
      await transaction.runStep.update({
        where: { id: approvalId },
        data: {
          status: stepStatus,
          completedAt: now,
          checkpoint: {
            approval: decision,
            decidedAt: now.toISOString(),
            seq: stepRow.seq,
          },
        },
      });
      await transaction.runEvent.create({
        data: {
          id: crypto.randomUUID(),
          runId,
          sequence: await this.nextRunSequence(transaction, runId),
          type: 'run.step_completed',
          payload: {
            id: crypto.randomUUID(),
            runId,
            sequence: 0,
            occurredAt: now.toISOString(),
            type: 'run.step_completed',
            step: {
              id: approvalId,
              runId,
              seq: stepRow.seq,
              kind: 'approval',
              status: stepStatus,
              input: stepRow.input,
              output: { decision },
              startedAt: stepRow.startedAt.toISOString(),
              completedAt: now.toISOString(),
            },
          },
          occurredAt: now,
        },
      });

      if (decision === 'approved') {
        // 续跑：Run → queued + 重新投递 tool.requested（同一 toolCall，含 idempotencyKey）
        const toolCall = stepRow.input as ToolCall | null;
        if (!toolCall) {
          throw new Error(`Approval ${approvalId} has no toolCall input to resume`);
        }
        await transaction.agentRun.update({
          where: { id: runId },
          data: { status: 'queued' },
        });
        await transaction.runEvent.create({
          data: {
            id: crypto.randomUUID(),
            runId,
            sequence: await this.nextRunSequence(transaction, runId),
            type: 'run.status_changed',
            payload: {
              id: crypto.randomUUID(),
              runId,
              sequence: 0,
              occurredAt: new Date().toISOString(),
              type: 'run.status_changed',
              status: 'queued',
            },
            occurredAt: new Date(),
          },
        });
        await this.outbox.enqueueToolRequested(
          transaction,
          {
            version: 1,
            runId,
            userId,
            toolCall: toolCallSchema.parse(toolCall),
          },
          priorityRankOf(run.priority),
        );
      } else {
        await transaction.agentRun.update({
          where: { id: runId },
          data: { status: 'cancelled' },
        });
        await transaction.runEvent.create({
          data: {
            id: crypto.randomUUID(),
            runId,
            sequence: await this.nextRunSequence(transaction, runId),
            type: 'run.status_changed',
            payload: {
              id: crypto.randomUUID(),
              runId,
              sequence: 0,
              occurredAt: new Date().toISOString(),
              type: 'run.status_changed',
              status: 'cancelled',
            },
            occurredAt: new Date(),
          },
        });
      }
    });

    return this.get(runId, userId);
  }

  private toContract(run: {
    id: string;
    userId: string;
    spaceId: string;
    spaceType: string;
    input: string;
    status: string;
    priority: string;
    idempotencyKey: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): AgentRun {
    return agentRunSchema.parse({
      id: run.id,
      userId: run.userId,
      space: { id: run.spaceId, type: run.spaceType },
      input: run.input,
      status: run.status,
      priority: run.priority,
      idempotencyKey: run.idempotencyKey ?? null,
      metadata: run.metadata ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    });
  }
}

/** priority 字符串 → outbox priorityRank（0=critical 最先取件，2=background 最后）。 */
function priorityRankOf(priority: string): number {
  if (priority === 'critical') return 0;
  if (priority === 'background') return 2;
  return 1;
}
