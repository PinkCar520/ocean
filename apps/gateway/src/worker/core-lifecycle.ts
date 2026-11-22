import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AgentExecutionEngine, type RuntimeSnapshot } from '@ocean/core';
import { PrismaRuntimeEventStore } from '../run/runtime-event-store';

/**
 * Shared Agent Core lifecycle used by the queue-backed Gateway Runner.
 * Every call takes the Worker's existing fenced Prisma transaction so Core
 * events commit atomically with RunStep, outbox and terminal Run status.
 *
 * The local CLI uses the inline AgentExecutionEngine protocol. Gateway uses
 * durable Engine segments here and only adapts them to PostgreSQL transactions;
 * tool claims precede execution and Worker results settle the same event stream.
 */
@Injectable()
export class GatewayCoreLifecycle {
  private engine(tx: Prisma.TransactionClient): AgentExecutionEngine<never> {
    return AgentExecutionEngine.durable(new PrismaRuntimeEventStore(tx));
  }

  async startModel(
    tx: Prisma.TransactionClient,
    runId: string,
    sessionId?: string,
  ): Promise<RuntimeSnapshot> {
    return this.engine(tx).startDurableModel(runId, sessionId);
  }

  /** Queue intent is not an execution claim: approval and schema validation
   * still happen in ToolExecutor before any external side effect is possible.
   */
  async queueTool(
    tx: Prisma.TransactionClient,
    runId: string,
    call: { id: string; name: string; input: unknown },
  ): Promise<RuntimeSnapshot> {
    return this.queueTools(tx, runId, [call]);
  }

  /** Persist the complete model decision atomically, even though the
   * Gateway Outbox executes one claimed tool at a time.
   */
  async queueTools(
    tx: Prisma.TransactionClient,
    runId: string,
    calls: readonly { id: string; name: string; input: unknown }[],
  ): Promise<RuntimeSnapshot> {
    return this.engine(tx).queueDurableTools(runId, calls);
  }

  /** ToolExecutor calls this inside its existing ownership-fenced transaction
   * after validation, approval, replacement-input checks and hook evaluation.
   */
  async prepareToolExecution(
    tx: Prisma.TransactionClient,
    runId: string,
    call: { id: string; name: string; input: unknown },
  ): Promise<RuntimeSnapshot> {
    return this.engine(tx).prepareDurableTool(runId, call);
  }

  async settleQueuedTool(
    tx: Prisma.TransactionClient,
    runId: string,
    invocationId: string,
    outcome: 'succeeded' | 'failed' | 'unknown',
    result: unknown,
    completed: boolean,
  ): Promise<RuntimeSnapshot> {
    return this.engine(tx).settleDurableTool(runId, invocationId, outcome, result, completed);
  }

  async finishModel(
    tx: Prisma.TransactionClient,
    runId: string,
    verified: boolean,
  ): Promise<RuntimeSnapshot> {
    return this.engine(tx).finishDurableModel(runId, verified);
  }

  async modelFailed(tx: Prisma.TransactionClient, runId: string, retryable: boolean): Promise<void> {
    return this.engine(tx).failDurableModel(runId, retryable);
  }
}
