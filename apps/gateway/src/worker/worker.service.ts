import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { runRequestedMessageSchema } from '@ocean/contracts';

import { OutboxService } from '../run/outbox.service';
import { RunRunner, type RunExecutionResult } from './run-runner';
import { ToolExecutor } from './tool-executor';

/**
 * WorkerService —— Gateway Worker 取件循环（Phase 4 骨架版）。
 *
 * 对应 docs/architecture/v2/worker-design-reference.md 5.1 / 5.5：
 * - 独立常驻进程，通过 Outbox 租约（FOR UPDATE SKIP LOCKED）竞争取件；
 * - 启动时恢复僵尸 Run：running 且长时间无更新的 Run 重置为 queued，
 *   并确保其 outbox 消息存在（重启不丢 Run 的兜底）；
 * - 循环用递归 setTimeout 而非 setInterval，避免上一轮未完成时重入；
 * - 优雅退出：停止取件，未完成任务由租约过期自然回收。
 */
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workerId = `worker-${hostname()}-${process.pid}`;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly runner: RunRunner,
    private readonly toolExecutor: ToolExecutor,
    private readonly outbox: OutboxService,
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStaleRuns();
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.log(`Worker started: ${this.workerId}`);
    void this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger.log(`Worker stopped: ${this.workerId}`);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    const claimLimit = this.intEnv('WORKER_CLAIM_LIMIT', 5);
    const leaseMs = this.intEnv('WORKER_LEASE_MS', 30_000);

    try {
      const jobs = await this.outbox.claimRunRequests(
        this.workerId,
        claimLimit,
        leaseMs,
      );
      for (const job of jobs) {
        await this.executeAndSettle(job, leaseMs);
      }
    } catch (error) {
      this.logger.error(`Poll iteration failed: ${this.describe(error)}`);
    } finally {
      if (this.running) {
        this.timer = setTimeout(
          () => void this.poll(),
          this.intEnv('WORKER_POLL_MS', 1_000),
        );
      }
    }
  }

  /** 执行单个 job 并按结果结算 outbox 消息：成功确认 / 可重试退避 / 业务失败确认（避免无限重试）。 */
  private async executeAndSettle(
    job: Awaited<ReturnType<OutboxService['claimRunRequests']>>[number],
    leaseMs: number,
  ): Promise<void> {
    const heartbeat = setInterval(
      () =>
        void this.outbox
          .renewLease(job.id, this.workerId, leaseMs)
          .catch(() => undefined),
      Math.max(1_000, Math.floor(leaseMs / 3)),
    );

    try {
      // 按主题路由：run.requested → RunRunner（模型调用）；tool.requested → ToolExecutor（幂等工具执行）
      const result =
        job.topic === 'run.requested'
          ? await this.runner.execute(job)
          : await this.toolExecutor.execute(job);
      await this.settle(job.id, result);
    } catch (error) {
      this.logger.error(
        `Runner crashed for job ${job.id}: ${this.describe(error)}`,
      );
      // Runner 内部异常未按契约返回：按可重试处理，放回队列由租约回收后重跑
      await this.outbox
        .markFailed(
          job.id,
          this.workerId,
          this.describe(error),
          this.retryDelayMs(),
        )
        .catch((err) =>
          this.logger.error(
            `Failed to mark job ${job.id} failed: ${this.describe(err)}`,
          ),
        );
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async settle(
    jobId: string,
    result: RunExecutionResult,
  ): Promise<void> {
    if (result.status === 'succeeded') {
      await this.outbox.markProcessed(jobId, this.workerId);
      this.logger.debug(`Job ${jobId} processed (run ${result.runId})`);
      return;
    }

    if (result.retryable) {
      await this.outbox.markFailed(
        jobId,
        this.workerId,
        result.error ?? 'retryable failure',
        this.retryDelayMs(),
      );
      this.logger.warn(
        `Job ${jobId} marked for retry (run ${result.runId}): ${result.error ?? ''}`,
      );
    } else {
      // 业务失败：Run 已置 failed，消息确认不再重试
      await this.outbox.markProcessed(jobId, this.workerId);
      this.logger.warn(
        `Job ${jobId} settled as terminal failure (run ${result.runId}): ${result.error ?? ''}`,
      );
    }
  }

  /**
   * 启动恢复：僵尸 Run（running 且超过 WORKER_STALE_MS 无更新）重置为 queued，
   * 并确保存在对应的 run.requested outbox 消息（丢失则补投），等待重新取件。
   * 骨架版阈值基于 updatedAt；RunStep 阶段引入 agent_run 执行租约后由租约控制。
   */
  private async recoverStaleRuns(): Promise<void> {
    const staleMs = this.intEnv('WORKER_STALE_MS', 300_000);
    const cutoff = new Date(Date.now() - staleMs);

    const staleRuns = await this.prisma.agentRun.findMany({
      where: { status: 'running', updatedAt: { lt: cutoff } },
      select: { id: true, userId: true },
    });
    if (staleRuns.length === 0) return;

    this.logger.warn(
      `Recovering ${staleRuns.length} stale run(s) left in 'running' state`,
    );
    for (const run of staleRuns) {
      try {
        await this.recoverRun(run);
      } catch (error) {
        this.logger.error(
          `Failed to recover run ${run.id}: ${this.describe(error)}`,
        );
      }
    }
  }

  private async recoverRun(run: { id: string; userId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.agentRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });
      if (!current || current.status !== 'running') return; // 已被其他进程处理

      const pendingMessage = await tx.outboxEvent.findFirst({
        where: {
          topic: 'run.requested',
          aggregateId: run.id,
          status: 'pending',
        },
      });
      if (!pendingMessage) {
        const payload = runRequestedMessageSchema.parse({
          version: 1,
          runId: run.id,
          userId: run.userId,
        });
        await tx.outboxEvent.create({
          data: {
            topic: 'run.requested',
            aggregateType: 'AgentRun',
            aggregateId: run.id,
            payload: payload,
          },
        });
      }

      await tx.agentRun.update({
        where: { id: run.id },
        data: { status: 'queued' },
      });

      const lastEvent = await tx.runEvent.findFirst({
        where: { runId: run.id },
        orderBy: { sequence: 'desc' },
      });
      await tx.runEvent.create({
        data: {
          id: randomUUID(),
          runId: run.id,
          sequence: lastEvent ? lastEvent.sequence + 1 : 0,
          type: 'run.status_changed',
          payload: {
            id: randomUUID(),
            runId: run.id,
            sequence: lastEvent ? lastEvent.sequence + 1 : 0,
            occurredAt: new Date().toISOString(),
            type: 'run.status_changed',
            status: 'queued',
          },
          occurredAt: new Date(),
        },
      });
    });
  }

  private retryDelayMs(): number {
    return this.intEnv('WORKER_RETRY_DELAY_MS', 5_000);
  }

  private intEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
