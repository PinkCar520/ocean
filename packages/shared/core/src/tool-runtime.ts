import { AgentRuntime } from './agent-runtime.js';
import type { RuntimeEventStore, RuntimeHost, ToolInvocation } from './runtime-contract.js';

export interface ToolDescriptor<Input = unknown> {
  name: string;
  host: ToolInvocation['host'];
  validate(input: unknown): Input;
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
/**
 * One authorization boundary for local and remote hosts. Skills may filter
 * descriptors, but cannot supply or override the policy evaluator.
 */
export class ToolRuntime {
  private readonly agent: AgentRuntime;
  constructor(store: RuntimeEventStore, host: RuntimeHost, private readonly authorization: ToolAuthorization) {
    this.agent = new AgentRuntime(store, host);
  }
  async invoke(runId: string, invocationId: string, descriptor: ToolDescriptor, rawInput: unknown): Promise<unknown> {
    const input = descriptor.validate(rawInput);
    const context: ToolPolicyContext = { runId, invocationId, toolName: descriptor.name, input };
    const inputFingerprint = JSON.stringify(input);
    const policyVersion = await this.authorization.policyVersion?.();
    const decision = await this.authorization.evaluate(context);
    if (decision === 'deny') throw new Error('Tool invocation denied by policy');
    if (decision === 'ask') {
      if (!this.authorization.approve || !await this.authorization.approve(context))
        throw new Error('Tool invocation approval required');
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
