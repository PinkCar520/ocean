import { createHash } from 'node:crypto';
import {
  replayRuntime,
  type RuntimeEvent,
  type RuntimeEventStore,
  type RuntimeHost,
  type RuntimeSnapshot,
  type RuntimeState,
  type ToolInvocation,
} from './runtime-contract.js';

const stamp = () => new Date().toISOString();
const digest = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

/**
 * Host-neutral execution coordinator. Persistence is a prerequisite to side effects.
 * Unknown outcomes are deliberately non-retryable without explicit reconciliation.
 */
export class AgentRuntime {
  constructor(private readonly store: RuntimeEventStore, private readonly host: RuntimeHost) {}

  async create(runId: string, sessionId?: string): Promise<RuntimeSnapshot> {
    await this.store.append(runId, 0, [{ type: 'run.created', runId, sessionId, schemaVersion: 1, at: stamp() }]);
    return this.snapshot(runId);
  }

  async snapshot(runId: string): Promise<RuntimeSnapshot> {
    return replayRuntime(runId, await this.store.read(runId));
  }

  async transition(runId: string, to: RuntimeState): Promise<RuntimeSnapshot> {
    const current = await this.snapshot(runId);
    await this.store.append(runId, current.revision, [
      { type: 'run.transitioned', runId, at: stamp(), from: current.state, to },
    ]);
    return this.snapshot(runId);
  }

  /** Crash recovery marks an active run interrupted; it never replays a tool. */
  async markInterrupted(runId: string): Promise<RuntimeSnapshot> {
    const current = await this.snapshot(runId);
    if (current.state === 'interrupted') return current;
    if (current.state === 'completed' || current.state === 'failed' || current.state === 'cancelled')
      throw new Error('Cannot interrupt a terminal run');
    return this.transition(runId, 'interrupted');
  }

  async activateSkill(runId: string, skillId: string, source: 'plugin' | 'user' | 'project'): Promise<RuntimeSnapshot> {
    const current = await this.snapshot(runId);
    await this.store.append(runId, current.revision, [{
      type: 'skill.activated', runId, at: stamp(), skillId, source,
    }]);
    return this.snapshot(runId);
  }

  async verifyCompletion(runId: string, checks: readonly string[]): Promise<RuntimeSnapshot> {
    const current = await this.snapshot(runId);
    if (current.state !== 'calling_model' && current.state !== 'persisting_results')
      throw new Error('Completion verification requires a finishing runtime state');
    await this.store.append(runId, current.revision, [{ type: 'run.completion_verified', runId, at: stamp(), checks }]);
    return this.snapshot(runId);
  }

  /** An operator/host must independently verify the external outcome before reconciliation.
   * Reconciliation never invokes the tool again.
   */
  async reconcileTool(runId: string, invocationId: string, outcome: 'succeeded' | 'failed', result: unknown): Promise<RuntimeSnapshot> {
    const events = await this.store.read(runId);
    const snapshot = replayRuntime(runId, events);
    if (snapshot.pendingTools[invocationId] !== 'unknown') throw new Error('Only unknown tool outcomes may be reconciled');
    const claim = events.find(event => event.type === 'tool.prepared' && event.invocation.id === invocationId);
    if (!claim) throw new Error('Missing persisted tool claim');
    // Append a reconciliation event rather than replacing history.
    await this.store.append(runId, snapshot.revision, [{
      type: 'tool.reconciled', runId, at: stamp(), invocationId, outcome, result,
    }]);
    return this.snapshot(runId);
  }

  /** Distributed hosts may enqueue an invocation only after this durable claim.
   * The same protocol is used by the inline CLI host.
   */
  async prepareTool(runId: string, invocation: ToolInvocation): Promise<RuntimeSnapshot> {
    const current = await this.snapshot(runId);
    if (current.state !== 'executing_tools') throw new Error('Runtime is not executing tools');
    if (invocation.runId !== runId || !invocation.id.trim())
      throw new Error('Invalid tool invocation identity');
    if (Object.hasOwn(current.pendingTools, invocation.id))
      throw new Error('Tool invocation already claimed; replay prohibited');
    await this.store.append(runId, current.revision, [
      { type: 'tool.prepared', runId, at: stamp(), invocation },
    ]);
    return this.snapshot(runId);
  }

  /** Persist the result independently from dispatch; used by queue-backed hosts.
   * A failed persistence leaves the claim unresolved and forbids automatic replay.
   */
  async settlePreparedTool(
    runId: string,
    invocationId: string,
    outcome: 'succeeded' | 'failed' | 'unknown',
    result?: unknown,
  ): Promise<RuntimeSnapshot> {
    const current = await this.snapshot(runId);
    if (current.pendingTools[invocationId] !== 'prepared')
      throw new Error('Tool settlement without preparation');
    const event: RuntimeEvent = {
      type: 'tool.settled', runId, at: stamp(), invocationId, outcome, result,
    };
    await this.store.append(runId, current.revision, [event]);
    return this.snapshot(runId);
  }

  async executeTool(runId: string, id: string, toolName: string, input: unknown, host: ToolInvocation['host']): Promise<unknown> {
    const capturedInput = structuredClone(input);
    const invocation: ToolInvocation = { id, runId, toolName, input: capturedInput, inputDigest: digest(capturedInput), host };
    await this.prepareTool(runId, invocation);
    let result: unknown;
    let outcome: 'succeeded' | 'failed' | 'unknown' = 'unknown';
    try {
      result = await this.host.execute(invocation);
      outcome = result && typeof result === 'object' && 'error' in result ? 'failed' : 'succeeded';
    } catch (error) {
      // An exception cannot prove a remote side effect was rolled back.
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    await this.settlePreparedTool(runId, id, outcome, result);
    if (outcome === 'unknown') throw new Error('Tool execution outcome unknown; manual reconciliation required');
    return result;
  }
}
