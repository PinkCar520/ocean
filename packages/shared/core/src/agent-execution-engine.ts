import { AgentRuntime } from './agent-runtime.js';
import { ToolRuntime, type ToolAuthorization, type ToolDescriptor } from './tool-runtime.js';
import type { RuntimeEventStore, RuntimeHost, RuntimeSnapshot, ToolInvocation } from './runtime-contract.js';
import { createHash } from 'node:crypto';

export type AgentModelDecision =
  | { kind: 'complete'; text: string }
  | { kind: 'tools'; calls: readonly { id: string; name: string; input: unknown }[]; text?: string };
export interface AgentModelPort<Message> {
  next(messages: readonly Message[], signal?: AbortSignal): Promise<AgentModelDecision>;
}
export interface AgentTranscriptPort<Message> {
  load(sessionId: string): Promise<readonly Message[]>;
  append(sessionId: string, expectedLength: number, messages: readonly Message[]): Promise<void>;
}
export interface AgentCompletionPort<Message> {
  verify(messages: readonly Message[], text: string): Promise<readonly string[]>;
  /** Optional host-provided feedback for a rejected Stop hook; bounded by maxSteps. */
  onIncomplete?(text: string): Promise<Message | undefined>;
}
export interface AgentExecutionPorts<Message> {
  events: RuntimeEventStore;
  host: RuntimeHost;
  model: AgentModelPort<Message>;
  /** Context adapter may compact or retrieve history without mutating transcript. */
  prepareContext?(messages: readonly Message[], signal?: AbortSignal): Promise<readonly Message[]>;
  transcript: AgentTranscriptPort<Message>;
  /** Host must reconcile persisted tool events against transcript and journal before resume. */
  reconcileRecovery?(sessionId: string, runId: string, events: readonly import('./runtime-contract.js').RuntimeEvent[]): Promise<void>;
  /** Durable host reconciliation proving Tool Journal and transcript cover every settled invocation. */
  verifyToolJournal?(sessionId: string, runId: string, events: readonly import('./runtime-contract.js').RuntimeEvent[]): Promise<boolean>;
  /** Hosts must certify transcript consistency before a model-only recovery. */
  verifyTranscript?(sessionId: string, runId: string, events: readonly import('./runtime-contract.js').RuntimeEvent[]): Promise<boolean>;
  authorization: ToolAuthorization;
  resolveTool(name: string): ToolDescriptor | undefined;
  /** Observational callbacks never authorize or execute tools. */
  onToolCall?(name: string, input: unknown): void;
  onToolResult?(name: string, result: unknown): void;
  toMessage(decision: AgentModelDecision, result?: unknown): Message;
  /** Adapters with structured tool-call/result pairs may emit multiple messages. */
  toMessages?(decision: AgentModelDecision, result?: unknown): readonly Message[];
  /** Host restores previously activated skills from durable Session evidence.
   * Skill scopes only constrain tools; they never grant host permissions.
   */
  restoreSkills?(sessionId: string): Promise<readonly { id: string; source: 'plugin' | 'user' | 'project'; allowedTools?: readonly string[] }[]>;
  /** Skill host identifies a successful activation without granting permissions. */
  activatedSkill?(toolName: string, result: unknown): { id: string; source: 'plugin' | 'user' | 'project'; allowedTools?: readonly string[] } | undefined;
  completion: AgentCompletionPort<Message>;
}
export interface AgentExecutionResult {
  text: string;
  snapshot: RuntimeSnapshot;
}
/**
 * Portable Agent execution loop. A host supplies model, storage and tools;
 * the core owns state transitions, write-ahead tool claims and completion.
 */
/**
 * A durable host may need to yield after a model decision while an external
 * worker executes tools. The same decision validation is shared with the
 * synchronous CLI loop, so both hosts reject malformed tool batches alike.
 */
export function validateAgentModelDecision(decision: AgentModelDecision): AgentModelDecision {
  if (!decision || (decision.kind !== 'complete' && decision.kind !== 'tools'))
    throw new Error('Model returned an invalid decision kind');
  if (decision.kind === 'complete') {
    if (typeof decision.text !== 'string') throw new Error('Model returned invalid completion text');
    return decision;
  }
  if (!Array.isArray(decision.calls) || !decision.calls.length)
    throw new Error('Model returned an empty tool batch');
  const ids = new Set<string>();
  for (const call of decision.calls) {
    if (typeof call.id !== 'string' || !call.id.trim() ||
        typeof call.name !== 'string' || !call.name.trim() || ids.has(call.id))
      throw new Error('Model returned invalid or duplicate tool invocation');
    // A model decision must be replayable after a process restart. Reject
    // non-JSON inputs before either host persists or dispatches side effects.
    let encoded: string | undefined;
    try { encoded = JSON.stringify(call.input); } catch { /* cyclic input */ }
    if (encoded === undefined) throw new Error('Model returned non-serializable tool input');
    ids.add(call.id);
  }
  return decision;
}

/**
 * Durable hosts use the same model-batch identity and ordering contract as
 * the in-process Engine. A settled sibling may never be scheduled twice.
 * An unresolved earlier invocation blocks all later side effects.
 */
export function nextDurableToolCall(
  calls: readonly { id: string; name: string; input: unknown }[],
  settledOrClaimedIds: ReadonlySet<string>,
  hasUnresolvedInvocation: boolean,
): { id: string; name: string; input: unknown } | undefined {
  validateAgentModelDecision({ kind: 'tools', calls });
  if (hasUnresolvedInvocation)
    throw new Error('Durable tool batch has an unresolved earlier invocation; reconciliation required');
  // A durable sequential batch may only claim a prefix. A later claimed
  // sibling with an earlier missing claim means the journal is inconsistent;
  // never replay the earlier tool or skip over the missing effect.
  let seenMissing = false;
  for (const call of calls) {
    if (!settledOrClaimedIds.has(call.id)) seenMissing = true;
    else if (seenMissing)
      throw new Error('Non-contiguous durable tool claims require journal reconciliation');
  }
  const knownIds = new Set(calls.map(call => call.id));
  if ([...settledOrClaimedIds].some(id => !knownIds.has(id)))
    throw new Error('Durable tool claim is absent from the model decision');
  return calls.find(call => !settledOrClaimedIds.has(call.id));
}

/**
 * Shared execution protocol for inline and queue-backed hosts.
 * Claims must form a contiguous prefix; an unresolved claim blocks dispatch.
 * A host persists the proposal before executing the returned call.
 */
export type AgentExecutionDirective =
  | { kind: 'complete'; text: string }
  | { kind: 'dispatch'; call: { id: string; name: string; input: unknown }; text?: string }
  | { kind: 'awaiting_results' };

export function nextAgentExecutionDirective(
  decision: AgentModelDecision,
  state: { claimedIds?: ReadonlySet<string>; unresolved?: boolean } = {},
): AgentExecutionDirective {
  validateAgentModelDecision(decision);
  if (decision.kind === 'complete') {
    if (state.unresolved || state.claimedIds?.size)
      throw new Error('Cannot complete while tool claims remain unresolved');
    return { kind: 'complete', text: decision.text };
  }
  const call = nextDurableToolCall(decision.calls, state.claimedIds ?? new Set<string>(), state.unresolved ?? false);
  return call ? { kind: 'dispatch', call, text: decision.text } : { kind: 'awaiting_results' };
}

/**
 * The queue-backed host cannot advance the model or the next sibling while
 * a previous tool claim or outbox delivery is still in flight.
 * In-process hosts use the same sequential dispatch contract, but settle
 * each invocation before requesting the next directive.
 */
export function planAgentExecutionResume(
  decision: AgentModelDecision,
  claimedIds: ReadonlySet<string>,
  inFlight: { unfinishedTool: boolean; pendingDeliveryIds: readonly string[] },
): AgentExecutionDirective | { kind: 'wait_for_host' } {
  validateAgentModelDecision(decision);
  if (decision.kind === 'complete') {
    if (inFlight.pendingDeliveryIds.length)
      throw new Error('Pending delivery has no model tool decision; journal reconciliation required');
    if (inFlight.unfinishedTool)
      return { kind: 'wait_for_host' };
    return nextAgentExecutionDirective(decision, { claimedIds });
  }
  const known = new Set(decision.calls.map(call => call.id));
  if (inFlight.pendingDeliveryIds.some(id => !known.has(id)))
    throw new Error('Pending delivery absent from model decision; reconciliation required');
  // Check journal ordering even when blocked by a pending delivery.
  nextDurableToolCall(decision.calls, claimedIds, false);
  if (inFlight.unfinishedTool || inFlight.pendingDeliveryIds.length)
    return { kind: 'wait_for_host' };
  return nextAgentExecutionDirective(decision, { claimedIds });
}

/**
 * A single scheduling contract for both the initial model decision and
 * subsequent queue-backed resumptions. The host persists the entire model
 * decision before enqueueing the returned invocation.
 */
export function planDurableModelDecision(
  decision: AgentModelDecision,
  claimedIds: ReadonlySet<string> = new Set<string>(),
  hasUnresolvedInvocation = false,
): { kind: 'complete'; text: string } | { kind: 'dispatch'; call: { id: string; name: string; input: unknown }; text?: string } | { kind: 'awaiting_results' } {
  return nextAgentExecutionDirective(decision, { claimedIds, unresolved: hasUnresolvedInvocation });
}

/**
 * Completion and failure are Core decisions; hosts only persist the chosen
 * transition and implement their own Stop hook / retry transport.
 */
export type AgentTerminalDirective =
  | { kind: 'commit_completion' }
  | { kind: 'continue_model'; feedback: string }
  | { kind: 'reject_completion' };

export function planAgentCompletion(
  verification: { accepted: boolean; feedback?: string },
): AgentTerminalDirective {
  if (verification.accepted) return { kind: 'commit_completion' };
  if (typeof verification.feedback === 'string' && verification.feedback.trim())
    return { kind: 'continue_model', feedback: verification.feedback };
  return { kind: 'reject_completion' };
}

export type AgentFailureDirective =
  | { kind: 'retry'; state: 'queued' }
  | { kind: 'terminate'; state: 'failed' };

export function planAgentFailure(retryable: boolean): AgentFailureDirective {
  return retryable ? { kind: 'retry', state: 'queued' } : { kind: 'terminate', state: 'failed' };
}

/**
 * Host-neutral driver for a model turn. Both inline and durable workers call
 * this before any transcript mutation, RunStep or Outbox side effect.
 */
/** The model-turn scheduling gate is owned by Core, not by a queue host.
 * Hosts supply journal evidence and perform only the resulting I/O.
 */
export interface AgentTurnReadiness {
  cancelled: boolean;
  pendingDeliveryIds: readonly string[];
  unfinishedTool: boolean;
  modelDecision?: AgentModelDecision;
  claimedIds?: ReadonlySet<string>;
}
export type AgentTurnPlan =
  | { kind: 'cancel' }
  | { kind: 'wait_for_host' }
  | { kind: 'call_model' }
  | AgentExecutionDirective;

export function planAgentTurn(readiness: AgentTurnReadiness): AgentTurnPlan {
  if (readiness.cancelled) return { kind: 'cancel' };
  if (!readiness.modelDecision) {
    if (readiness.unfinishedTool || readiness.pendingDeliveryIds.length)
      return { kind: 'wait_for_host' };
    return { kind: 'call_model' };
  }
  return planAgentExecutionResume(
    readiness.modelDecision,
    readiness.claimedIds ?? new Set<string>(),
    { unfinishedTool: readiness.unfinishedTool, pendingDeliveryIds: readiness.pendingDeliveryIds },
  );
}

export class AgentExecutionDriver {
  planTurn(readiness: AgentTurnReadiness): AgentTurnPlan {
    return planAgentTurn(readiness);
  }
  decide(decision: AgentModelDecision): AgentExecutionDirective {
    return nextAgentExecutionDirective(decision);
  }

  resume(
    decision: AgentModelDecision,
    claimedIds: ReadonlySet<string>,
    inFlight: { unfinishedTool: boolean; pendingDeliveryIds: readonly string[] },
  ): AgentExecutionDirective | { kind: 'wait_for_host' } {
    return planAgentExecutionResume(decision, claimedIds, inFlight);
  }

  completion(accepted: boolean, feedback?: string): AgentTerminalDirective {
    return planAgentCompletion({ accepted, feedback });
  }

  failure(retryable: boolean): AgentFailureDirective {
    return planAgentFailure(retryable);
  }
}

export class AgentExecutionEngine<Message> {
  constructor(private readonly ports: AgentExecutionPorts<Message> | RuntimeEventStore) {}

  /** A queue-backed host uses the same Engine in durable execution segments.
   * The event store is normally scoped to the host's ownership-fenced transaction.
   */
  static durable<Message = never>(events: RuntimeEventStore): AgentExecutionEngine<Message> {
    return new AgentExecutionEngine<Message>(events);
  }

  static planDurableDecision(
    ...args: Parameters<typeof planDurableModelDecision>
  ): ReturnType<typeof planDurableModelDecision> {
    return planDurableModelDecision(...args);
  }

  private executionPorts(): AgentExecutionPorts<Message> {
    if (!('model' in this.ports)) throw new Error('Inline Agent execution requires model and transcript ports');
    return this.ports;
  }

  private durableRuntime(): AgentRuntime {
    if (!('read' in this.ports)) throw new Error('Durable Agent execution requires a transaction-scoped event store');
    return new AgentRuntime(this.ports, {
      execute: async () => { throw new Error('Durable tools must execute through the host Worker'); },
    });
  }

  private async durableSnapshot(runId: string): Promise<RuntimeSnapshot | undefined> {
    if (!('read' in this.ports)) throw new Error('Durable Agent execution requires a transaction-scoped event store');
    const events = await this.ports.read(runId);
    if (!events.length) return undefined;
    return this.durableRuntime().snapshot(runId);
  }

  /** Resolve the immutable Session identity for an existing durable Run.
   * A missing sessionId may be supplied for legacy runs, but a different
   * session must never take over the event stream.
   */
  async assertDurableSession(runId: string, sessionId: string): Promise<void> {
    if (!sessionId.trim()) throw new Error('Durable session identity is required');
    const snapshot = await this.durableSnapshot(runId);
    if (!snapshot) throw new Error('Durable runtime session not found');
    if (snapshot.sessionId !== sessionId)
      throw new Error('Durable runtime session identity mismatch');
  }

  /** Begin an initial or recovered model segment without replaying unsettled effects. */
  async startDurableModel(runId: string, sessionId?: string): Promise<RuntimeSnapshot> {
    const runtime = this.durableRuntime();
    let current = await this.durableSnapshot(runId);
    if (!current) current = await runtime.create(runId, sessionId || runId);
    if (sessionId && current.sessionId && current.sessionId !== sessionId)
      throw new Error('Durable runtime session identity mismatch');
    if (Object.values(current.pendingTools).some(value => value === 'prepared' || value === 'unknown'))
      throw new Error('Durable recovery requires tool journal reconciliation; automatic replay prohibited');
    const captured = current;
    if (Object.keys(captured.queuedTools).some(id => !Object.hasOwn(captured.pendingTools, id)))
      throw new Error('Durable queued tool has not executed; model replay prohibited');

    if (current.state === 'executing_tools') {
      current = await runtime.transition(runId, 'persisting_results');
    } else if (current.state === 'calling_model' || current.state === 'validating_tools' ||
               current.state === 'awaiting_approval') {
      current = await runtime.markInterrupted(runId);
    }
    if (current.state === 'created' || current.state === 'persisting_results' || current.state === 'interrupted')
      current = await runtime.transition(runId, 'preparing_context');
    if (current.state !== 'preparing_context')
      throw new Error(`Durable cannot begin model call in state ${current.state}`);
    return runtime.transition(runId, 'calling_model');
  }

  /** Persist the complete model batch before any Worker side effect. */
  async queueDurableTools(
    runId: string,
    calls: readonly { id: string; name: string; input: unknown }[],
  ): Promise<RuntimeSnapshot> {
    const runtime = this.durableRuntime();
    const snapshot = await runtime.snapshot(runId);
    if (snapshot.state !== 'calling_model' || !calls.length)
      throw new Error('Durable queued tools must originate from a model call');
    await runtime.transition(runId, 'validating_tools');
    return runtime.proposeTools(runId, calls);
  }

  /** Claim exactly one already-proposed call in the Worker's fenced transaction. */
  async prepareDurableTool(
    runId: string,
    call: { id: string; name: string; input: unknown },
  ): Promise<RuntimeSnapshot> {
    const runtime = this.durableRuntime();
    let snapshot = await this.durableSnapshot(runId);
    if (!snapshot) {
      snapshot = await runtime.create(runId, runId);
      await runtime.transition(runId, 'preparing_context');
      await runtime.transition(runId, 'calling_model');
      snapshot = await runtime.transition(runId, 'validating_tools');
    }
    if (snapshot.pendingTools[call.id])
      throw new Error('Durable tool call already claimed; replay prohibited');
    const proposed = snapshot.queuedTools[call.id];
    if (Object.keys(snapshot.queuedTools).length && !proposed)
      throw new Error('Tool invocation is not the queued model proposal');
    if (proposed && proposed.toolName !== call.name)
      throw new Error('Queued tool name mismatch');
    if (snapshot.state === 'validating_tools' || snapshot.state === 'awaiting_approval')
      snapshot = await runtime.transition(runId, 'executing_tools');
    if (snapshot.state !== 'executing_tools')
      throw new Error('Durable tool claim has invalid runtime state');
    const serialized = JSON.stringify(call.input);
    if (serialized === undefined) throw new Error('Tool input is not serializable');
    const invocation: ToolInvocation = {
      id: call.id, runId, toolName: call.name, input: call.input,
      inputDigest: createHash('sha256').update(serialized).digest('hex'), host: 'remote',
    };
    return runtime.prepareTool(runId, invocation);
  }

  /** Settle a Worker result and resume only after every proposed sibling is durable. */
  async settleDurableTool(
    runId: string,
    invocationId: string,
    outcome: 'succeeded' | 'failed' | 'unknown',
    result: unknown,
    completed: boolean,
  ): Promise<RuntimeSnapshot> {
    const runtime = this.durableRuntime();
    const current = await runtime.snapshot(runId);
    if (current.state !== 'executing_tools' || current.pendingTools[invocationId] !== 'prepared')
      throw new Error('Durable tool execution has no matching persisted claim');
    const settled = await runtime.settlePreparedTool(runId, invocationId, outcome, result);
    if (Object.keys(settled.queuedTools).some(id => !Object.hasOwn(settled.pendingTools, id)) ||
        Object.values(settled.pendingTools).some(value => value === 'prepared' || value === 'unknown'))
      return settled;
    await runtime.transition(runId, 'persisting_results');
    if (completed) {
      await runtime.verifyCompletion(runId, ['Durable tool result committed to RunStep']);
      return runtime.transition(runId, 'completed');
    }
    return runtime.snapshot(runId);
  }

  async finishDurableModel(runId: string, verified: boolean): Promise<RuntimeSnapshot> {
    const runtime = this.durableRuntime();
    if (!verified) return runtime.transition(runId, 'persisting_results');
    await runtime.verifyCompletion(runId, ['Model response persisted and Stop hook accepted']);
    return runtime.transition(runId, 'completed');
  }

  async failDurableModel(runId: string, retryable: boolean): Promise<void> {
    const runtime = this.durableRuntime();
    const snapshot = await this.durableSnapshot(runId);
    if (!snapshot || ['completed', 'failed', 'cancelled'].includes(snapshot.state)) return;
    if (retryable) await runtime.markInterrupted(runId);
    else if (snapshot.state === 'created') {
      await runtime.markInterrupted(runId);
      await runtime.transition(runId, 'failed');
    } else await runtime.transition(runId, 'failed');
  }

  async resume(sessionId: string, runId: string, maxSteps = 30, signal?: AbortSignal): Promise<AgentExecutionResult> {
    return this.execute(sessionId, runId, maxSteps, signal, true);
  }

  async run(sessionId: string, runId: string, maxSteps = 30, signal?: AbortSignal): Promise<AgentExecutionResult> {
    return this.execute(sessionId, runId, maxSteps, signal, false);
  }

  private async execute(sessionId: string, runId: string, maxSteps: number, signal: AbortSignal | undefined, resume: boolean): Promise<AgentExecutionResult> {
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error('Invalid agent step limit');
    const ports = this.executionPorts();
    const driver = new AgentExecutionDriver();
    const runtime = new AgentRuntime(ports.events, ports.host);
    const baseAuthorization = ports.authorization;
    const tools = new ToolRuntime(ports.events, ports.host, {
      evaluate: async context => {
        const snapshot = await runtime.snapshot(runId);
        if (Object.values(snapshot.skillToolConstraints).some(allowed =>
          allowed !== null && !allowed.includes(context.toolName))) return 'deny';
        return baseAuthorization.evaluate(context);
      },
      approve: baseAuthorization.approve
        ? context => baseAuthorization.approve!(context) : undefined,
      policyVersion: async () => JSON.stringify({
        host: await baseAuthorization.policyVersion?.(),
        skills: (await runtime.snapshot(runId)).skillToolConstraints,
      }),
    });
    if (resume) {
      const events = await ports.events.read(runId);
      const snapshot = await runtime.snapshot(runId);
      if (snapshot.sessionId !== sessionId || snapshot.state !== 'interrupted') throw new Error('Run is not resumable for this session');
      // Transcript reconciliation is host-specific. Never resume a run with
      // recorded tool side effects until the host has verified its journal.
      if (Object.keys(snapshot.queuedTools).some(id => !Object.hasOwn(snapshot.pendingTools, id)))
        throw new Error('Unfinished model tool batch requires journal reconciliation before resume');
      if (events.some(event => event.type === 'tool.prepared')) {
        if (!ports.reconcileRecovery)
          throw new Error('Tool journal reconciliation required before resume');
        await ports.reconcileRecovery(sessionId, runId, events);
        // A host may repair the transcript, but unresolved tool effects must
        // never be retried by the model on the strength of a callback alone.
        const recovered = await runtime.snapshot(runId);
        if (Object.values(recovered.pendingTools).some(outcome => outcome === 'prepared' || outcome === 'unknown'))
          throw new Error('Unresolved tool effects require manual reconciliation');
        if (!ports.verifyToolJournal || !await ports.verifyToolJournal(sessionId, runId, await ports.events.read(runId)))
          throw new Error('Tool journal and transcript verification required before resume');
      } else if (!ports.verifyTranscript || !await ports.verifyTranscript(sessionId, runId, events)) {
        throw new Error('Transcript verification required before resume');
      }
    } else {
      await runtime.create(runId, sessionId);
      try {
        for (const skill of await ports.restoreSkills?.(sessionId) ?? [])
          await runtime.activateSkill(runId, skill.id, skill.source, skill.allowedTools);
      } catch (error) {
        await runtime.markInterrupted(runId);
        await runtime.transition(runId, 'failed');
        throw error;
      }
    }
    let messages = [...await ports.transcript.load(sessionId)];
    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) {
        await runtime.transition(runId, 'cancelled');
        signal.throwIfAborted();
      }
      const beforeModel = await runtime.snapshot(runId);
      if (beforeModel.state === 'created' || beforeModel.state === 'persisting_results' || beforeModel.state === 'interrupted')
        await runtime.transition(runId, 'preparing_context');
      await runtime.transition(runId, 'calling_model');
      let decision: AgentModelDecision;
      try {
        const context = ports.prepareContext ? await ports.prepareContext(messages, signal) : messages;
        decision = validateAgentModelDecision(await ports.model.next(context, signal));
      } catch (error) {
        await runtime.transition(runId, signal?.aborted ? 'cancelled' : 'failed');
        throw error;
      }
      if (decision.kind === 'complete') {
        let checks: readonly string[];
        try { checks = await ports.completion.verify(messages, decision.text); }
        catch (error) { await runtime.transition(runId, 'failed'); throw error; }
        if (!checks.length) {
          const feedback = await ports.completion.onIncomplete?.(decision.text);
          const completion = driver.completion(false, typeof feedback === 'string' ? feedback : feedback === undefined ? undefined : 'host-feedback');
          if (completion.kind === 'continue_model' && feedback !== undefined) {
            const assistant = ports.toMessages?.(decision) ?? [ports.toMessage(decision)];
            try {
              await ports.transcript.append(sessionId, messages.length, [...assistant, feedback]);
            } catch (error) {
              await runtime.markInterrupted(runId);
              throw error;
            }
            messages.push(...assistant, feedback);
            await runtime.transition(runId, 'persisting_results');
            continue;
          }
          await runtime.transition(runId, 'failed');
          throw new Error('Agent completion verification failed');
        }
        const next = ports.toMessages?.(decision) ?? [ports.toMessage(decision)];
        // The final response is only committed after host verification; if
        // transcript persistence fails, the run must remain recoverable.
        try {
          await ports.transcript.append(sessionId, messages.length, next);
        } catch (error) {
          await runtime.markInterrupted(runId);
          throw error;
        }
        messages.push(...next);
        await runtime.verifyCompletion(runId, checks);
        return { text: decision.text, snapshot: await runtime.transition(runId, 'completed') };
      }
      if (!decision.calls.length) {
        await runtime.transition(runId, 'failed');
        throw new Error('Model returned an empty tool batch');
      }
      await runtime.transition(runId, 'validating_tools');
      let prepared: Array<{ call: (typeof decision.calls)[number]; descriptor: ToolDescriptor }>;
      try {
        prepared = decision.calls.map(call => {
          const descriptor = ports.resolveTool(call.name);
          if (!descriptor) throw new Error(`Unknown tool: ${call.name}`);
          return { call, descriptor };
        });
      } catch (error) {
        await runtime.transition(runId, 'failed');
        throw error;
      }
      // Persist all model-declared calls atomically, before the first host
      // effect; a partial batch must not silently disappear on recovery.
      try {
        await runtime.proposeTools(runId, prepared.map(({ call }) => call));
      } catch (error) {
        await runtime.transition(runId, 'failed');
        throw error;
      }
      await runtime.transition(runId, 'executing_tools');
      try {
        const claimed = new Set<string>();
        for (let callIndex = 0; callIndex < prepared.length; callIndex++) {
          const directive = driver.resume(decision, claimed, { unfinishedTool: false, pendingDeliveryIds: [] });
          if (directive.kind !== 'dispatch')
            throw new Error('Shared execution protocol expected a tool dispatch');
          const { call } = directive;
          const descriptor = prepared[callIndex].descriptor;
          signal?.throwIfAborted();
          try { ports.onToolCall?.(call.name, call.input); } catch { /* telemetry cannot affect execution */ }
          const result = await tools.invoke(runId, call.id, descriptor, call.input);
          try { ports.onToolResult?.(call.name, result); } catch { /* telemetry cannot affect execution */ }
          const activated = ports.activatedSkill?.(call.name, result);
          const toolDecision: AgentModelDecision = {
            kind: 'tools', calls: [call],
            text: callIndex === 0 ? decision.text : undefined,
          };
          const next = ports.toMessages?.(toolDecision, result) ?? [ports.toMessage(toolDecision, result)];
          await ports.transcript.append(sessionId, messages.length, next);
          messages.push(...next);
          claimed.add(call.id);
          // An activated skill must only enter durable Runtime state after its
          // invocation/result pair is committed to the Session transcript.
          if (activated) await runtime.activateSkill(runId, activated.id, activated.source, activated.allowedTools);
        }
      } catch (error) {
        await runtime.transition(runId, signal?.aborted ? 'cancelled' : 'interrupted');
        throw error;
      }
      await runtime.transition(runId, 'persisting_results');
    }
    await runtime.transition(runId, 'failed');
    throw new Error('Agent execution exceeded maximum steps');
  }
}
