import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  runEventSchema,
  runStepSchema,
  runRequestedMessageSchema,
  type LeasedRunJob,
  type RunEvent,
  type RunStep,
  type ToolCall,
} from '@ocean/contracts';

import { RetryableError, type RunExecutionResult } from './run-runner';
import { OutboxService } from '../run/outbox.service';
import { ToolRegistry } from '../tool/tool.registry';
import { TerminalToolError } from '../tool/tool.types';

/** TerminalToolError 由 tool.types 定义并在此 re-export（spec/外部兼容）。 */
export { TerminalToolError } from '../tool/tool.types';

/**
 * ToolExecutor —— 单步工具执行器（Phase 4 第 4 项：幂等工具调用 + 失败分类）。
 *
 * 对应 docs/architecture/v2/worker-design-reference.md 5.2 StepExecutor.ToolCall：
 * - **幂等**：相同 `toolCall.idempotencyKey` 已存在 succeeded 步骤时直接返回缓存
 *   output，不再调用工具 execute —— 重复投递（崩溃重跑/客户端重试）不产生
 *   二次外部写操作（K4）。
 * - **步骤化**：kind=tool_call 的 RunStep（started/succeeded/failed）落库，
 *   与 run.step_started / run.step_completed / tool.completed 事件同一事务。
 * - **失败分类**：TerminalToolError（业务错误）→ run failed 终态、消息确认；
 *   其他（网络/超时/瞬时）→ run 回 queued、消息退避重试。
 */
@Injectable()
export class ToolExecutor {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly registry: ToolRegistry,
    private readonly outbox: OutboxService,
  ) {}

  async execute(job: LeasedRunJob): Promise<RunExecutionResult> {
    if (job.topic !== 'tool.requested') {
      throw new Error(`ToolExecutor received unexpected topic: ${job.topic}`);
    }
    const { runId, userId, toolCall } = job.payload;
    try {
      // 1) 幂等检查：同 run + 同 idempotencyKey 的 succeeded tool_call 步骤 → 缓存命中
      if (toolCall.idempotencyKey) {
        const cached = await this.findSucceededByIdempotencyKey(
          runId,
          toolCall.idempotencyKey,
        );
        if (cached) {
          // 缓存命中：工具此前已成功执行，不产生二次副作用。
          // 若为 Agent Loop 驱动的 Run（存在 model_call 步骤）且尚未终结，
          // 重投 run.requested 补偿回喂续跑（崩溃窗口内 run.requested 可能丢失）。
          const run = await this.prisma.agentRun.findUnique({
            where: { id: runId },
            select: { priority: true },
          });
          await this.prisma.$transaction(async (tx) => {
            await this.continueLoopIfModelDriven(
              tx,
              runId,
              userId,
              run?.priority ?? 'interactive',
            );
          });
          return {
            jobId: job.id,
            runId,
            status: 'succeeded',
            cached: true,
          };
        }
      }

      // 2) 前置校验（fail fast）：run 存在 + 归属 + 工具存在
      //    业务错误直接终态，不把 Run 置 running 后再失败
      const runCheck = await this.prisma.agentRun.findUnique({
        where: { id: runId },
        select: { id: true, userId: true, priority: true },
      });
      if (!runCheck) {
        return {
          jobId: job.id,
          runId,
          status: 'failed',
          retryable: false,
          error: `Run ${runId} not found`,
        };
      }
      if (runCheck.userId !== userId) {
        return {
          jobId: job.id,
          runId,
          status: 'failed',
          retryable: false,
          error: `Run ${runId} does not belong to user ${userId}`,
        };
      }
      const tool = this.registry.get(toolCall.name);
      if (!tool) {
        throw new TerminalToolError(`Unknown tool: ${toolCall.name}`);
      }

      // 审批门（Phase 4.5）：需要审批的工具先创建审批，Run → waiting_for_approval
      // （不置 running）；审批通过后由 RunService 重新投递 tool.requested，
      // 本执行器从检查点（已 approved 的审批记录）续跑执行。
      if (tool.requiresApproval) {
        const gate = await this.ensureApproval(runId, userId, toolCall);
        if (!gate.executable) {
          // pending → 等待人工决策（消息确认，不重试，决策后重新投递）；
          // rejected/expired → Run 已 cancelled（终态，消息确认）。
          return { jobId: job.id, runId, status: 'succeeded' };
        }
      }

      // 3) 接管：置 running（幂等处理崩溃遗留）
      await this.prisma.$transaction(async (tx) => {
        const run = await tx.agentRun.findUnique({
          where: { id: runId },
          select: { status: true },
        });
        if (run && run.status !== 'running') {
          await tx.agentRun.update({
            where: { id: runId },
            data: { status: 'running' },
          });
          await this.appendEvent(tx, runId, {
            id: randomUUID(),
            runId,
            sequence: await this.nextSequence(tx, runId),
            occurredAt: new Date().toISOString(),
            type: 'run.status_changed',
            status: 'running',
          });
        }
      });

      // 4) 步骤 started（崩溃续跑复用 started 步骤，不重复写 step_started）
      const step = await this.ensureStepStarted(runId, toolCall);

      // 5) 执行工具
      const output = await tool.execute(toolCall.input, { runId, userId });

      // 6) 完成：step succeeded + step_completed + tool.completed；
      //    Agent Loop 驱动的 Run（存在 model_call 步骤）→ Run queued + 重投
      //    run.requested 回喂模型续跑；纯工具 Run → Run succeeded（现状）。
      const outputJson = output as Prisma.InputJsonValue;
      await this.prisma.$transaction(async (tx) => {
        await tx.runStep.update({
          where: { id: step.id },
          data: {
            status: 'succeeded',
            output: outputJson,
            completedAt: new Date(),
          },
        });
        await this.appendEvent(tx, runId, {
          id: randomUUID(),
          runId,
          sequence: await this.nextSequence(tx, runId),
          occurredAt: new Date().toISOString(),
          type: 'run.step_completed',
          step: this.toStepContract({
            id: step.id,
            runId,
            seq: step.seq,
            kind: 'tool_call',
            status: 'succeeded',
            input: toolCall,
            output,
          }),
        });
        await this.appendEvent(tx, runId, {
          id: randomUUID(),
          runId,
          sequence: await this.nextSequence(tx, runId),
          occurredAt: new Date().toISOString(),
          type: 'tool.completed',
          toolCallId: toolCall.id,
          result: output,
        });

        const loop = await this.continueLoopIfModelDriven(
          tx,
          runId,
          userId,
          runCheck.priority,
        );
        if (loop) {
          await tx.agentRun.update({
            where: { id: runId },
            data: { status: 'queued' },
          });
          await this.appendEvent(tx, runId, {
            id: randomUUID(),
            runId,
            sequence: await this.nextSequence(tx, runId),
            occurredAt: new Date().toISOString(),
            type: 'run.status_changed',
            status: 'queued',
          });
        } else {
          await tx.agentRun.update({
            where: { id: runId },
            data: { status: 'succeeded' },
          });
          await this.appendEvent(tx, runId, {
            id: randomUUID(),
            runId,
            sequence: await this.nextSequence(tx, runId),
            occurredAt: new Date().toISOString(),
            type: 'run.status_changed',
            status: 'succeeded',
          });
        }
      });

      return { jobId: job.id, runId, status: 'succeeded' };
    } catch (error) {
      return this.handleFailure(job, toolCall, error);
    }
  }

  /** 幂等查询：同 run 内 idempotencyKey 已 succeeded 的 tool_call 步骤。 */
  private async findSucceededByIdempotencyKey(
    runId: string,
    idempotencyKey: string,
  ): Promise<{ id: string } | null> {
    const steps = await this.prisma.runStep.findMany({
      where: { runId, kind: 'tool_call' },
      orderBy: { seq: 'desc' },
    });
    const hit = steps.find(
      (step) =>
        step.status === 'succeeded' &&
        this.inputKey(step.input) === idempotencyKey,
    );
    return hit ? { id: hit.id } : null;
  }

  private inputKey(input: Prisma.JsonValue | null): string | undefined {
    if (
      input &&
      typeof input === 'object' &&
      !Array.isArray(input) &&
      'idempotencyKey' in input &&
      typeof (input as Record<string, unknown>).idempotencyKey === 'string'
    ) {
      return (input as { idempotencyKey: string }).idempotencyKey;
    }
    return undefined;
  }

  /**
   * 审批门（Phase 4.5）：需要审批的工具首次到达时创建审批步骤 + RunApproval(pending)，
   * Run → waiting_for_approval；已有审批记录则按状态决定是否可执行（approved 续跑）。
   * 崩溃续跑（消息回队列重试）时已有 pending 记录 → 不再重复创建。
   */
  private async ensureApproval(
    runId: string,
    userId: string,
    toolCall: ToolCall,
  ): Promise<{ executable: boolean }> {
    const existing = await this.prisma.runApproval.findFirst({
      where: { runId, toolCallId: toolCall.id },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { executable: existing.status === 'approved' };
    }

    await this.prisma.$transaction(async (tx) => {
      const approvalId = randomUUID();
      const seq = await this.nextStepSeq(tx, runId);
      const inputJson = JSON.parse(
        JSON.stringify(toolCall),
      ) as Prisma.InputJsonValue;
      await tx.runStep.create({
        data: {
          id: approvalId,
          runId,
          seq,
          kind: 'approval',
          status: 'started',
          input: inputJson,
        },
      });
      await this.appendEvent(tx, runId, {
        id: randomUUID(),
        runId,
        sequence: await this.nextSequence(tx, runId),
        occurredAt: new Date().toISOString(),
        type: 'run.step_started',
        step: this.toStepContract({
          id: approvalId,
          runId,
          seq,
          kind: 'approval',
          status: 'started',
          input: toolCall,
        }),
      });
      await tx.runApproval.create({
        data: {
          id: approvalId,
          runId,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: toolCall.input as Prisma.InputJsonValue,
        },
      });
      await this.appendEvent(tx, runId, {
        id: randomUUID(),
        runId,
        sequence: await this.nextSequence(tx, runId),
        occurredAt: new Date().toISOString(),
        type: 'approval.requested',
        approval: {
          id: approvalId,
          runId,
          toolCallId: toolCall.id,
          status: 'pending',
        },
      });
      await tx.agentRun.update({
        where: { id: runId },
        data: { status: 'waiting_for_approval' },
      });
      await this.appendEvent(tx, runId, {
        id: randomUUID(),
        runId,
        sequence: await this.nextSequence(tx, runId),
        occurredAt: new Date().toISOString(),
        type: 'run.status_changed',
        status: 'waiting_for_approval',
      });
    });
    return { executable: false };
  }

  /**
   * Agent Loop 续跑补偿：仅当 Run 由循环驱动（存在 model_call 步骤）且未终结
   * （queued/running）时，重投 `run.requested` 让 RunRunner 回喂 tool_result
   * 继续下一轮模型调用。纯工具 Run（无 model_call）保持原语义不动。
   */
  private async continueLoopIfModelDriven(
    tx: Prisma.TransactionClient,
    runId: string,
    userId: string,
    runPriority: string,
  ): Promise<boolean> {
    const run = await tx.agentRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (!run || (run.status !== 'queued' && run.status !== 'running')) {
      return false;
    }
    const modelStep = await tx.runStep.findFirst({
      where: { runId, kind: 'model_call' },
      select: { id: true },
    });
    if (!modelStep) return false;

    await this.outbox.enqueueRunRequested(
      tx,
      runRequestedMessageSchema.parse({ version: 1, runId, userId }),
      priorityRankOf(runPriority),
    );
    return true;
  }

  /** 确保 tool_call 步骤存在：新步骤创建 started + step_started 事件；崩溃续跑复用。 */
  private async ensureStepStarted(
    runId: string,
    toolCall: ToolCall,
  ): Promise<{ id: string; seq: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.runStep.findFirst({
        where: { runId, kind: 'tool_call' },
        orderBy: { seq: 'desc' },
      });
      if (existing && existing.status === 'started') {
        return { id: existing.id, seq: existing.seq };
      }

      const id = randomUUID();
      const seq = await this.nextStepSeq(tx, runId);
      await tx.runStep.create({
        data: {
          id,
          runId,
          seq,
          kind: 'tool_call',
          status: 'started',
          input: JSON.parse(JSON.stringify(toolCall)) as Prisma.InputJsonValue,
        },
      });
      await this.appendEvent(tx, runId, {
        id: randomUUID(),
        runId,
        sequence: await this.nextSequence(tx, runId),
        occurredAt: new Date().toISOString(),
        type: 'run.step_started',
        step: this.toStepContract({
          id,
          runId,
          seq,
          kind: 'tool_call',
          status: 'started',
          input: toolCall,
        }),
      });
      return { id, seq };
    });
  }

  private async handleFailure(
    job: LeasedRunJob,
    toolCall: ToolCall,
    error: unknown,
  ): Promise<RunExecutionResult> {
    const { runId } = job.payload;
    const message = error instanceof Error ? error.message : String(error);
    const terminal = error instanceof TerminalToolError;

    try {
      await this.prisma.$transaction(async (tx) => {
        const latest = await tx.runStep.findFirst({
          where: { runId, kind: 'tool_call' },
          orderBy: { seq: 'desc' },
        });
        if (latest && latest.status === 'started') {
          await tx.runStep.update({
            where: { id: latest.id },
            data: { status: 'failed', error: message, completedAt: new Date() },
          });
        }

        if (terminal) {
          await tx.agentRun.update({
            where: { id: runId },
            data: { status: 'failed' },
          });
          await this.appendEvent(tx, runId, {
            id: randomUUID(),
            runId,
            sequence: await this.nextSequence(tx, runId),
            occurredAt: new Date().toISOString(),
            type: 'run.failed',
            code: 'tool_execution_failed',
            message,
          });
        } else {
          await tx.agentRun.update({
            where: { id: runId },
            data: { status: 'queued' },
          });
          await this.appendEvent(tx, runId, {
            id: randomUUID(),
            runId,
            sequence: await this.nextSequence(tx, runId),
            occurredAt: new Date().toISOString(),
            type: 'run.status_changed',
            status: 'queued',
          });
        }
      });
    } catch (finalizeError) {
      return {
        jobId: job.id,
        runId,
        status: 'failed',
        retryable: true,
        error:
          finalizeError instanceof Error
            ? finalizeError.message
            : String(finalizeError),
      };
    }

    return {
      jobId: job.id,
      runId,
      status: 'failed',
      retryable: !terminal,
      error: message,
    };
  }

  private toStepContract(step: {
    id: string;
    runId: string;
    seq: number;
    kind: 'tool_call' | 'approval';
    status: 'started' | 'succeeded' | 'failed' | 'interrupted';
    input?: unknown;
    output?: unknown;
    error?: string;
  }): RunStep {
    return runStepSchema.parse({
      id: step.id,
      runId: step.runId,
      seq: step.seq,
      kind: step.kind,
      status: step.status,
      input: step.input,
      output: step.output,
      error: step.error,
      startedAt: new Date().toISOString(),
      completedAt:
        step.status === 'succeeded' || step.status === 'failed'
          ? new Date().toISOString()
          : undefined,
    });
  }

  private async nextStepSeq(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<number> {
    const last = await tx.runStep.findFirst({
      where: { runId },
      orderBy: { seq: 'desc' },
    });
    return last ? last.seq + 1 : 1;
  }

  private async nextSequence(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<number> {
    const last = await tx.runEvent.findFirst({
      where: { runId },
      orderBy: { sequence: 'desc' },
    });
    return last ? last.sequence + 1 : 0;
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    runId: string,
    event: RunEvent,
  ): Promise<void> {
    const parsed = runEventSchema.parse(event);
    await tx.runEvent.create({
      data: {
        id: parsed.id,
        runId,
        sequence: parsed.sequence,
        type: parsed.type,
        payload: parsed as Prisma.InputJsonValue,
        occurredAt: new Date(parsed.occurredAt),
      },
    });
  }
}

/** priority 字符串 → outbox priorityRank（0=critical 最先取件，2=background 最后）。 */
function priorityRankOf(priority: string): number {
  if (priority === 'critical') return 0;
  if (priority === 'background') return 2;
  return 1;
}
