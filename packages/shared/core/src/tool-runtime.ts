import { AgentRuntime } from './agent-runtime.js';
import type { RuntimeEventStore, RuntimeHost, ToolInvocation } from './runtime-contract.js';

export interface ToolDescriptor<Input = unknown> {
  name: string;
  host: ToolInvocation['host'];
  validate(input: unknown): Input | Promise<Input>;
}
export interface ToolPolicyContext {
  runId: string;
  invocationId: string;
  toolName: string;
  input: unknown;
}
export interface ToolAuthorization {
  /** Explicit allow only. No implicit approval or skill-provided privilege elevation. */
  evaluate(context: ToolPolicyContext): Promise<'allow' | 'deny' | 'ask'>;
  approve?(context: ToolPolicyContext): Promise<boolean>;
  /** Required for callers that need to pin approvals to a mutable policy source. */
  policyVersion?(): Promise<string>;
}
/** Normalize host output before either durable journal or Runtime Event
 * persists it, so recovery compares the same bounded representation.
 */
export function normalizeToolOutput(result: unknown): unknown {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(result); }
  catch { return { error: 'Tool output is not JSON serializable' }; }
  if (serialized === undefined) return null;
  if (new TextEncoder().encode(serialized).byteLength > 1024 * 1024)
    return { truncated: true, error: 'Tool output exceeded 1 MiB limit' };
  return result;
}

/**
 * One authorization boundary for local and remote hosts. Skills may filter
 * descriptors, but cannot supply or override the policy evaluator.
 */
export class ToolRuntime {
  private readonly agent: AgentRuntime;
  constructor(private readonly store: RuntimeEventStore, host: RuntimeHost, private readonly authorization: ToolAuthorization) {
    const guardedHost: RuntimeHost = {
      execute: async invocation => {
        return normalizeToolOutput(await host.execute(invocation));
      },
    };
    this.agent = new AgentRuntime(store, guardedHost);
  }
  private async rejected(runId: string, invocationId: string, toolName: string, reason: 'policy' | 'approval' | 'input'): Promise<void> {
    const snapshot = await this.agent.snapshot(runId);
    await this.store.append(runId, snapshot.revision, [{ type: 'tool.rejected', runId, at: new Date().toISOString(), invocationId, toolName, reason }]);
  }

  async invoke(runId: string, invocationId: string, descriptor: ToolDescriptor, rawInput: unknown): Promise<unknown> {
    let input: unknown;
    try { input = await descriptor.validate(rawInput); }
    catch (error) {
      await this.rejected(runId, invocationId, descriptor.name, 'input');
      throw error;
    }
    const context: ToolPolicyContext = { runId, invocationId, toolName: descriptor.name, input };
    const inputFingerprint = JSON.stringify(input);
    const policyVersion = await this.authorization.policyVersion?.();
    const decision = await this.authorization.evaluate(context);
    if (decision === 'deny') {
      await this.rejected(runId, invocationId, descriptor.name, 'policy');
      throw new Error('Tool invocation denied by policy');
    }
    if (decision === 'ask') {
      if (!this.authorization.approve || !await this.authorization.approve(context)) {
        await this.rejected(runId, invocationId, descriptor.name, 'approval');
        throw new Error('Tool invocation approval required');
      }
      // The policy is authoritative even after approval; a changed policy
      // cannot silently inherit a stale approval.
      if (policyVersion !== await this.authorization.policyVersion?.())
        throw new Error('Tool approval invalidated by policy change');
      if (JSON.stringify(input) !== inputFingerprint)
        throw new Error('Tool input changed after approval');
      if (await this.authorization.evaluate(context) === 'deny')
        throw new Error('Tool invocation denied after approval');
    }
    if (JSON.stringify(input) !== inputFingerprint) throw new Error('Tool input changed before execution');
    if (policyVersion !== await this.authorization.policyVersion?.()) throw new Error('Tool policy changed before execution');
    return this.agent.executeTool(runId, invocationId, descriptor.name, input, descriptor.host);
  }
}
