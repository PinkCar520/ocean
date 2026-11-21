import { AgentRuntime } from './agent-runtime.js';
import { ToolRuntime, type ToolAuthorization, type ToolDescriptor } from './tool-runtime.js';
import type { RuntimeEventStore, RuntimeHost, RuntimeSnapshot } from './runtime-contract.js';

export type AgentModelDecision =
  | { kind: 'complete'; text: string }
  | { kind: 'tools'; calls: readonly { id: string; name: string; input: unknown }[] };
export interface AgentModelPort<Message> {
  next(messages: readonly Message[], signal?: AbortSignal): Promise<AgentModelDecision>;
}
export interface AgentTranscriptPort<Message> {
  load(sessionId: string): Promise<readonly Message[]>;
  append(sessionId: string, expectedLength: number, messages: readonly Message[]): Promise<void>;
}
export interface AgentCompletionPort<Message> {
  verify(messages: readonly Message[], text: string): Promise<readonly string[]>;
}
export interface AgentExecutionPorts<Message> {
  events: RuntimeEventStore;
  host: RuntimeHost;
  model: AgentModelPort<Message>;
  /** Context adapter may compact or retrieve history without mutating transcript. */
  prepareContext?(messages: readonly Message[], signal?: AbortSignal): Promise<readonly Message[]>;
  transcript: AgentTranscriptPort<Message>;
  authorization: ToolAuthorization;
  resolveTool(name: string): ToolDescriptor | undefined;
  toMessage(decision: AgentModelDecision, result?: unknown): Message;
  /** Skill host identifies a successful activation without granting permissions. */
  activatedSkill?(toolName: string, result: unknown): { id: string; source: 'plugin' | 'user' | 'project' } | undefined;
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
    const tools = new ToolRuntime(this.ports.events, this.ports.host, this.ports.authorization);
    if (resume) {
      const events = await this.ports.events.read(runId);
      const snapshot = await runtime.snapshot(runId);
      if (snapshot.sessionId !== sessionId || snapshot.state !== 'interrupted') throw new Error('Run is not resumable for this session');
      // Transcript reconciliation is host-specific. Never resume a run with
      // recorded tool side effects until the host has verified its journal.
      if (events.some(event => event.type === 'tool.prepared'))
        throw new Error('Tool journal reconciliation required before resume');
    } else {
      await runtime.create(runId, sessionId);
    }
    let messages = [...await this.ports.transcript.load(sessionId)];
    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) {
        await runtime.transition(runId, 'cancelled');
        signal.throwIfAborted();
      }
      await runtime.transition(runId, 'preparing_context');
      await runtime.transition(runId, 'calling_model');
      let decision: AgentModelDecision;
      try {
        const context = this.ports.prepareContext ? await this.ports.prepareContext(messages, signal) : messages;
        decision = await this.ports.model.next(context, signal);
      } catch (error) {
        await runtime.transition(runId, signal?.aborted ? 'cancelled' : 'failed');
        throw error;
      }
      if (decision.kind === 'complete') {
        let checks: readonly string[];
        try { checks = await this.ports.completion.verify(messages, decision.text); }
        catch (error) { await runtime.transition(runId, 'failed'); throw error; }
        if (!checks.length) {
          await runtime.transition(runId, 'failed');
          throw new Error('Agent completion verification failed');
        }
        const next = this.ports.toMessage(decision);
        await this.ports.transcript.append(sessionId, messages.length, [next]);
        messages.push(next);
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
      await runtime.transition(runId, 'executing_tools');
      try {
        for (const { call, descriptor } of prepared) {
          signal?.throwIfAborted();
          const result = await tools.invoke(runId, call.id, descriptor, call.input);
          const activated = this.ports.activatedSkill?.(call.name, result);
          if (activated) await runtime.activateSkill(runId, activated.id, activated.source);
          const message = this.ports.toMessage({ kind: 'tools', calls: [call] }, result);
          await this.ports.transcript.append(sessionId, messages.length, [message]);
          messages.push(message);
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
