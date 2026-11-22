import { AgentRuntime } from './agent-runtime.js';
import { ToolRuntime, type ToolAuthorization, type ToolDescriptor } from './tool-runtime.js';
import type { RuntimeEventStore, RuntimeHost, RuntimeSnapshot } from './runtime-contract.js';

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
  if (decision.kind === 'complete') return decision;
  if (!decision.calls.length) throw new Error('Model returned an empty tool batch');
  const ids = new Set<string>();
  for (const call of decision.calls) {
    if (!call.id || !call.name || ids.has(call.id))
      throw new Error('Model returned invalid or duplicate tool invocation');
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
    throw new Error('Gateway tool batch has an unresolved earlier invocation; reconciliation required');
  return calls.find(call => !settledOrClaimedIds.has(call.id));
}

export class AgentExecutionEngine<Message> {
  constructor(private readonly ports: AgentExecutionPorts<Message>) {}

  async resume(sessionId: string, runId: string, maxSteps = 30, signal?: AbortSignal): Promise<AgentExecutionResult> {
    return this.execute(sessionId, runId, maxSteps, signal, true);
  }

  async run(sessionId: string, runId: string, maxSteps = 30, signal?: AbortSignal): Promise<AgentExecutionResult> {
    return this.execute(sessionId, runId, maxSteps, signal, false);
  }

  private async execute(sessionId: string, runId: string, maxSteps: number, signal: AbortSignal | undefined, resume: boolean): Promise<AgentExecutionResult> {
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error('Invalid agent step limit');
    const runtime = new AgentRuntime(this.ports.events, this.ports.host);
    const baseAuthorization = this.ports.authorization;
    const tools = new ToolRuntime(this.ports.events, this.ports.host, {
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
      const events = await this.ports.events.read(runId);
      const snapshot = await runtime.snapshot(runId);
      if (snapshot.sessionId !== sessionId || snapshot.state !== 'interrupted') throw new Error('Run is not resumable for this session');
      // Transcript reconciliation is host-specific. Never resume a run with
      // recorded tool side effects until the host has verified its journal.
      if (Object.keys(snapshot.queuedTools).some(id => !Object.hasOwn(snapshot.pendingTools, id)))
        throw new Error('Unfinished model tool batch requires journal reconciliation before resume');
      if (events.some(event => event.type === 'tool.prepared')) {
        if (!this.ports.reconcileRecovery)
          throw new Error('Tool journal reconciliation required before resume');
        await this.ports.reconcileRecovery(sessionId, runId, events);
        // A host may repair the transcript, but unresolved tool effects must
        // never be retried by the model on the strength of a callback alone.
        const recovered = await runtime.snapshot(runId);
        if (Object.values(recovered.pendingTools).some(outcome => outcome === 'prepared' || outcome === 'unknown'))
          throw new Error('Unresolved tool effects require manual reconciliation');
        if (!this.ports.verifyToolJournal || !await this.ports.verifyToolJournal(sessionId, runId, await this.ports.events.read(runId)))
          throw new Error('Tool journal and transcript verification required before resume');
      } else if (!this.ports.verifyTranscript || !await this.ports.verifyTranscript(sessionId, runId, events)) {
        throw new Error('Transcript verification required before resume');
      }
    } else {
      await runtime.create(runId, sessionId);
      try {
        for (const skill of await this.ports.restoreSkills?.(sessionId) ?? [])
          await runtime.activateSkill(runId, skill.id, skill.source, skill.allowedTools);
      } catch (error) {
        await runtime.markInterrupted(runId);
        await runtime.transition(runId, 'failed');
        throw error;
      }
    }
    let messages = [...await this.ports.transcript.load(sessionId)];
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
        const context = this.ports.prepareContext ? await this.ports.prepareContext(messages, signal) : messages;
        decision = validateAgentModelDecision(await this.ports.model.next(context, signal));
      } catch (error) {
        await runtime.transition(runId, signal?.aborted ? 'cancelled' : 'failed');
        throw error;
      }
      if (decision.kind === 'complete') {
        let checks: readonly string[];
        try { checks = await this.ports.completion.verify(messages, decision.text); }
        catch (error) { await runtime.transition(runId, 'failed'); throw error; }
        if (!checks.length) {
          const feedback = await this.ports.completion.onIncomplete?.(decision.text);
          if (feedback !== undefined) {
            const assistant = this.ports.toMessages?.(decision) ?? [this.ports.toMessage(decision)];
            try {
              await this.ports.transcript.append(sessionId, messages.length, [...assistant, feedback]);
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
        const next = this.ports.toMessages?.(decision) ?? [this.ports.toMessage(decision)];
        // The final response is only committed after host verification; if
        // transcript persistence fails, the run must remain recoverable.
        try {
          await this.ports.transcript.append(sessionId, messages.length, next);
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
          const descriptor = this.ports.resolveTool(call.name);
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
        for (const [callIndex, { call, descriptor }] of prepared.entries()) {
          signal?.throwIfAborted();
          try { this.ports.onToolCall?.(call.name, call.input); } catch { /* telemetry cannot affect execution */ }
          const result = await tools.invoke(runId, call.id, descriptor, call.input);
          try { this.ports.onToolResult?.(call.name, result); } catch { /* telemetry cannot affect execution */ }
          const activated = this.ports.activatedSkill?.(call.name, result);
          const toolDecision: AgentModelDecision = {
            kind: 'tools', calls: [call],
            text: callIndex === 0 ? decision.text : undefined,
          };
          const next = this.ports.toMessages?.(toolDecision, result) ?? [this.ports.toMessage(toolDecision, result)];
          await this.ports.transcript.append(sessionId, messages.length, next);
          messages.push(...next);
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
