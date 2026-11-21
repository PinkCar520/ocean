import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AgentRuntime, type RuntimeSnapshot, type ToolInvocation } from '@ocean/core';
import { PrismaRuntimeEventStore } from '../run/runtime-event-store';

/**
 * Shared Agent Core lifecycle used by the queue-backed Gateway Runner.
 * Every call takes the Worker's existing fenced Prisma transaction so Core
 * events commit atomically with RunStep, outbox and terminal Run status.
 *
 * The local CLI uses AgentRuntime/ToolRuntime directly with an inline host.
 * Gateway does not dispatch tools here: it records claims before queuing
 * and records settlements after its Worker executes the claimed operation.
 */
@Injectable()
export class GatewayCoreLifecycle {
  private runtime(tx: Prisma.TransactionClient): AgentRuntime {
    return new AgentRuntime(new PrismaRuntimeEventStore(tx), {
      execute: async () => { throw new Error('Gateway tools must execute through the fenced ToolExecutor'); },
    });
  }

  private async snapshot(tx: Prisma.TransactionClient, runId: string): Promise<RuntimeSnapshot | undefined> {
    const events = await new PrismaRuntimeEventStore(tx).read(runId);
    if (!events.length) return undefined;
    return this.runtime(tx).snapshot(runId);
  }

  async startModel(
    tx: Prisma.TransactionClient,
    runId: string,
    sessionId?: string,
  ): Promise<RuntimeSnapshot> {
    const runtime = this.runtime(tx);
    let current = await this.snapshot(tx, runId);
    if (!current) current = await runtime.create(runId, sessionId || runId);
    if (Object.values(current.pendingTools).some(value => value === 'prepared' || value === 'unknown'))
      throw new Error('Gateway recovery requires tool journal reconciliation; automatic replay prohibited');
    if (current.state === 'validating_tools' &&
        Object.keys(current.queuedTools).some(id => current.pendingTools[id] === undefined))
      throw new Error('Gateway queued tool has not executed; model replay prohibited');

    if (current.state === 'executing_tools') {
      current = await runtime.transition(runId, 'persisting_results');
    } else if (current.state === 'calling_model' || current.state === 'validating_tools' ||
               current.state === 'awaiting_approval') {
      current = await runtime.markInterrupted(runId);
    }
    if (current.state === 'created' || current.state === 'persisting_results' ||
        current.state === 'interrupted') {
      current = await runtime.transition(runId, 'preparing_context');
    }
    if (current.state !== 'preparing_context')
      throw new Error(`Gateway cannot begin model call in state ${current.state}`);
    return runtime.transition(runId, 'calling_model');
  }

  /** Queue intent is not an execution claim: approval and schema validation
   * still happen in ToolExecutor before any external side effect is possible.
   */
  async queueTool(
    tx: Prisma.TransactionClient,
    runId: string,
    call: { id: string; name: string; input: unknown },
  ): Promise<RuntimeSnapshot> {
    const runtime = this.runtime(tx);
    const snapshot = await runtime.snapshot(runId);
    if (snapshot.state !== 'calling_model')
      throw new Error('Gateway queued tool must originate from a model call');
    const serialized = JSON.stringify(call.input);
    if (serialized === undefined) throw new Error('Tool input is not serializable');
    await runtime.transition(runId, 'validating_tools');
    const current = await runtime.snapshot(runId);
    await new PrismaRuntimeEventStore(tx).append(runId, current.revision, [{
      type: 'tool.proposed', runId, at: new Date().toISOString(),
      invocationId: call.id, toolName: call.name,
      inputDigest: createHash('sha256').update(serialized).digest('hex'),
    }]);
    return runtime.snapshot(runId);
  }

  /** ToolExecutor calls this inside its existing ownership-fenced transaction
   * after validation, approval, replacement-input checks and hook evaluation.
   */
  async prepareToolExecution(
    tx: Prisma.TransactionClient,
    runId: string,
    call: { id: string; name: string; input: unknown },
  ): Promise<RuntimeSnapshot> {
    const runtime = this.runtime(tx);
    let snapshot = await this.snapshot(tx, runId);
    if (!snapshot) {
      // Standalone queued tool calls may have no model step.
      snapshot = await runtime.create(runId, runId);
      await runtime.transition(runId, 'preparing_context');
      await runtime.transition(runId, 'calling_model');
      snapshot = await runtime.transition(runId, 'validating_tools');
    }
    if (snapshot.pendingTools[call.id])
      throw new Error('Gateway tool call already claimed; replay prohibited');
    const proposed = snapshot.queuedTools[call.id];
    if (Object.keys(snapshot.queuedTools).length && !proposed)
      throw new Error('Tool invocation is not the queued model proposal');
    if (proposed && proposed.toolName !== call.name)
      throw new Error('Queued tool name mismatch');
    if (snapshot.state === 'validating_tools' || snapshot.state === 'awaiting_approval')
      snapshot = await runtime.transition(runId, 'executing_tools');
    if (snapshot.state !== 'executing_tools')
      throw new Error('Gateway tool claim has invalid runtime state');
    const serialized = JSON.stringify(call.input);
    if (serialized === undefined) throw new Error('Tool input is not serializable');
    const invocation: ToolInvocation = {
      id: call.id, runId, toolName: call.name, input: call.input,
      inputDigest: createHash('sha256').update(serialized).digest('hex'),
      host: 'remote',
    };
    return runtime.prepareTool(runId, invocation);
  }

  async settleQueuedTool(
    tx: Prisma.TransactionClient,
    runId: string,
    invocationId: string,
    outcome: 'succeeded' | 'failed' | 'unknown',
    result: unknown,
    completed: boolean,
  ): Promise<RuntimeSnapshot> {
    const runtime = this.runtime(tx);
    const current = await runtime.snapshot(runId);
    if (current.state !== 'executing_tools' || current.pendingTools[invocationId] !== 'prepared')
      throw new Error('Gateway tool execution has no matching persisted claim');
    await runtime.settlePreparedTool(runId, invocationId, outcome, result);
    await runtime.transition(runId, 'persisting_results');
    if (completed) {
      await runtime.verifyCompletion(runId, ['Gateway tool result committed to RunStep']);
      return runtime.transition(runId, 'completed');
    }
    return runtime.snapshot(runId);
  }

  async finishModel(
    tx: Prisma.TransactionClient,
    runId: string,
    verified: boolean,
  ): Promise<RuntimeSnapshot> {
    const runtime = this.runtime(tx);
    if (!verified) return runtime.transition(runId, 'persisting_results');
    await runtime.verifyCompletion(runId, ['Model response persisted and Stop hook accepted']);
    return runtime.transition(runId, 'completed');
  }

  async modelFailed(tx: Prisma.TransactionClient, runId: string, retryable: boolean): Promise<void> {
    const runtime = this.runtime(tx);
    const snapshot = await this.snapshot(tx, runId);
    if (!snapshot || ['completed', 'failed', 'cancelled'].includes(snapshot.state)) return;
    if (retryable) await runtime.markInterrupted(runId);
    else if (snapshot.state === 'created') {
      await runtime.markInterrupted(runId);
      await runtime.transition(runId, 'failed');
    } else await runtime.transition(runId, 'failed');
  }
}
