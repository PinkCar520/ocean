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

  async create(runId: string): Promise<RuntimeSnapshot> {
    await this.store.append(runId, 0, [{ type: 'run.created', runId, at: stamp() }]);
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

  async executeTool(runId: string, id: string, toolName: string, input: unknown, host: ToolInvocation['host']): Promise<unknown> {
    const current = await this.snapshot(runId);
    if (current.state !== 'executing_tools') throw new Error('Runtime is not executing tools');
    if (Object.hasOwn(current.pendingTools, id)) throw new Error('Tool invocation already claimed; replay prohibited');
    const invocation: ToolInvocation = { id, runId, toolName, input, inputDigest: digest(input), host };
    await this.store.append(runId, current.revision, [
      { type: 'tool.prepared', runId, at: stamp(), invocation },
    ]);
    let result: unknown;
    let outcome: 'succeeded' | 'failed' | 'unknown' = 'unknown';
    try {
      result = await this.host.execute(invocation);
      outcome = 'succeeded';
    } catch (error) {
      // A thrown error does not prove the external side effect was rolled back.
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    const after = await this.snapshot(runId);
    const event: RuntimeEvent = { type: 'tool.settled', runId, at: stamp(), invocationId: id, outcome, result };
    await this.store.append(runId, after.revision, [event]);
    if (outcome === 'unknown') throw new Error('Tool execution outcome unknown; manual reconciliation required');
    return result;
  }
}
