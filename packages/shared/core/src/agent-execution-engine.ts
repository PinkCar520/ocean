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
  transcript: AgentTranscriptPort<Message>;
  authorization: ToolAuthorization;
  resolveTool(name: string): ToolDescriptor | undefined;
  toMessage(decision: AgentModelDecision, result?: unknown): Message;
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

  async run(sessionId: string, runId: string, maxSteps = 30, signal?: AbortSignal): Promise<AgentExecutionResult> {
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error('Invalid agent step limit');
    const runtime = new AgentRuntime(this.ports.events, this.ports.host);
    const tools = new ToolRuntime(this.ports.events, this.ports.host, this.ports.authorization);
    await runtime.create(runId, sessionId);
    let messages = [...await this.ports.transcript.load(sessionId)];
    for (let step = 0; step < maxSteps; step++) {
      signal?.throwIfAborted();
      await runtime.transition(runId, 'preparing_context');
      await runtime.transition(runId, 'calling_model');
      let decision: AgentModelDecision;
      try {
        decision = await this.ports.model.next(messages, signal);
      } catch (error) {
        await runtime.transition(runId, signal?.aborted ? 'interrupted' : 'failed');
        throw error;
      }
      if (decision.kind === 'complete') {
        const checks = await this.ports.completion.verify(messages, decision.text);
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
      const prepared = decision.calls.map(call => {
        const descriptor = this.ports.resolveTool(call.name);
        if (!descriptor) throw new Error(`Unknown tool: ${call.name}`);
        return { call, descriptor };
      });
      await runtime.transition(runId, 'executing_tools');
      try {
        for (const { call, descriptor } of prepared) {
          signal?.throwIfAborted();
          const result = await tools.invoke(runId, call.id, descriptor, call.input);
          const message = this.ports.toMessage({ kind: 'tools', calls: [call] }, result);
          await this.ports.transcript.append(sessionId, messages.length, [message]);
          messages.push(message);
        }
      } catch (error) {
        await runtime.transition(runId, 'interrupted');
        throw error;
      }
      await runtime.transition(runId, 'persisting_results');
    }
    await runtime.transition(runId, 'failed');
    throw new Error('Agent execution exceeded maximum steps');
  }
}
