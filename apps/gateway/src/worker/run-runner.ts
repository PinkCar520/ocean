import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  runEventSchema,
  runStepSchema,
  type LeasedRunJob,
  type RunEvent,
  type RunStep,
} from '@ocean/contracts';
import { MODEL_GATEWAY, type ModelGateway } from '../ai/model-gateway';

/**
 * 可重试错误：瞬时失败（数据库连接、超时、锁冲突、模型调用网络错误）
 * 应放回队列退避重试。业务错误（校验失败、权限拒绝、目标不存在）不可重试，
 * 直接终止 Run。
 */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

export interface RunExecutionResult {
  jobId: string;
  runId: string;
  status: 'succeeded' | 'failed';
  retryable?: boolean;
  error?: string;
  /** 幂等命中：相同 idempotencyKey 已成功执行过，本次未执行外部副作用。 */
  cached?: boolean;
}

/** 流式输出攒批阈值：达到即落一条 run.output_delta 事件（避免事件爆炸）。 */
const DELTA_FLUSH_CHARS = 64;

/**
 * RunRunner —— 单个 Run 的执行器（Phase 4 第 2 项：纯文本模型调用迁入 Run）。
 *
 * 职责边界（对应 docs/architecture/v2/worker-design-reference.md 5.2）：
 * - 接管 Run：queued → running，写入 RunEvent（与状态变更同一事务）。
 * - 执行 model_call 步骤：通过 ModelGateway 流式调用模型，把文本增量
 *   投影为 run.output_delta 事件；步骤状态（started/succeeded/failed）
 *   落 run_step 表，并发出 run.step_started / run.step_completed 事件。
 * - 完成/失败：succeeded 或 failed（不可重试）/ queued（可重试，等 Worker 放回队列）。
 *
 * 崩溃语义：
 * - run 已是 running（上次崩溃遗留）→ 直接续跑，不重复写 running 事件。
 * - 已存在 status=started 的 model_call 步骤 → 复用该步骤续跑，
 *   不重复创建步骤与 step_started 事件（幂等）。
 */
@Injectable()
export class RunRunner {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Inject(MODEL_GATEWAY) private readonly modelGateway: ModelGateway,
  ) {}

  async execute(job: LeasedRunJob): Promise<RunExecutionResult> {
    const { runId, userId } = job.payload;

    try {
      // 1) 接管：置 running（幂等处理崩溃遗留）
      //    Run 不存在 / 用户不匹配属于终态业务错误：直接返回，不写库、不可重试，
      //    由 Worker 确认消息（避免残留消息无限重试）。
      const takeover = await this.prisma.$transaction(async (tx) => {
        const run = await tx.agentRun.findUnique({ where: { id: runId } });
        if (!run)
          return { ok: false as const, reason: `Run ${runId} not found` };
        if (run.userId !== userId)
          return {
            ok: false as const,
            reason: `Run ${runId} does not belong to user ${userId}`,
          };

        if (run.status !== 'running') {
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
        return { ok: true as const, input: run.input };
      });

      if (!takeover.ok) {
        return {
          jobId: job.id,
          runId,
          status: 'failed',
          retryable: false,
          error: takeover.reason,
        };
      }

      // 2) model_call 步骤：started（崩溃续跑复用 started 步骤，不重复写事件）
      const step = await this.ensureStepStarted(runId, takeover.input);

      // 3) 流式生成 → run.output_delta（每攒够 DELTA_FLUSH_CHARS 落一条）
      let buffer = '';
      let fullText = '';
      try {
        for await (const chunk of this.modelGateway.stream(takeover.input)) {
          fullText += chunk.text;
          buffer += chunk.text;
          if (buffer.length >= DELTA_FLUSH_CHARS) {
            await this.flushDelta(runId, buffer);
            buffer = '';
          }
        }
      } catch (error) {
        // 模型调用多为网络/上游瞬时问题，放回队列退避重试（第 4 项再细化失败分类）
        throw new RetryableError(
          `model call failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (buffer.length > 0) {
        await this.flushDelta(runId, buffer);
      }

      // 4) 完成：step succeeded + step_completed + run succeeded（同一事务）
      await this.prisma.$transaction(async (tx) => {
        await tx.runStep.update({
          where: { id: step.id },
          data: {
            status: 'succeeded',
            output: { text: fullText },
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
            status: 'succeeded',
            input: { prompt: takeover.input },
            output: { text: fullText },
          }),
        });
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
      });

      return { jobId: job.id, runId, status: 'succeeded' };
    } catch (error) {
      return this.handleFailure(job, error);
    }
  }

  /** 确保 model_call 步骤存在：新 Run 创建 started 步骤并写 step_started 事件；崩溃续跑复用。 */
  private async ensureStepStarted(
    runId: string,
    input: string,
  ): Promise<{ id: string; seq: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.runStep.findFirst({
        where: { runId, kind: 'model_call' },
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
          kind: 'model_call',
          status: 'started',
          input: { prompt: input },
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
          status: 'started',
          input: { prompt: input },
        }),
      });
      return { id, seq };
    });
  }

  /** 落一条 output_delta 事件；写入失败视为瞬时错误（可重试），避免 Run 卡死。 */
  private async flushDelta(runId: string, delta: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.appendEvent(tx, runId, {
          id: randomUUID(),
          runId,
          sequence: await this.nextSequence(tx, runId),
          occurredAt: new Date().toISOString(),
          type: 'run.output_delta',
          delta,
        });
      });
    } catch (error) {
      throw new RetryableError(
        `output_delta write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleFailure(
    job: LeasedRunJob,
    error: unknown,
  ): Promise<RunExecutionResult> {
    const { runId } = job.payload;
    const message = error instanceof Error ? error.message : String(error);
    const retryable = error instanceof RetryableError;

    try {
      await this.prisma.$transaction(async (tx) => {
        // 已创建的执行步骤标记 failed（存在则更新，幂等）
        const latest = await tx.runStep.findFirst({
          where: { runId, kind: 'model_call' },
          orderBy: { seq: 'desc' },
        });
        if (latest && latest.status === 'started') {
          await tx.runStep.update({
            where: { id: latest.id },
            data: { status: 'failed', error: message, completedAt: new Date() },
          });
        }

        if (retryable) {
          // 瞬时失败：Run 回到 queued，由 Worker 对 outbox 消息退避重试后再取
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
          // 业务失败：Run 终止并记录失败原因，不再重试
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
            code: 'run_execution_failed',
            message,
          });
        }
      });
    } catch (finalizeError) {
      // 失败落库本身失败（如 DB 不可用）：返回可重试，让消息回队列，避免 Run 卡死
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
      retryable,
      error: message,
    };
  }

  private toStepContract(step: {
    id: string;
    runId: string;
    seq: number;
    status: 'started' | 'succeeded' | 'failed' | 'interrupted';
    input?: unknown;
    output?: unknown;
    error?: string;
  }): RunStep {
    return runStepSchema.parse({
      id: step.id,
      runId: step.runId,
      seq: step.seq,
      kind: 'model_call',
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
