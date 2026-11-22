import type { ToolAuthorization, ToolPolicyContext } from '@ocean/core';
import type { PermissionPolicy } from '../utils/permission-policy.js';

export interface CliToolGate {
  requiresApproval?: boolean | ((input: unknown) => boolean);
  beforeApproval?: (input: unknown) => Promise<string | undefined> | string | undefined;
}

/** Bridge existing layered CLI permissions and tool-specific safety guards.
 * An allowed policy decision cannot bypass a tool's own approval requirement.
 */
export function createCliToolAuthorization(
  policy: PermissionPolicy,
  approve?: (context: ToolPolicyContext) => Promise<boolean>,
  tools: Readonly<Record<string, CliToolGate>> = {},
): ToolAuthorization {
  return {
    evaluate: async context => {
      const input = context.input as Record<string, unknown>;
      const policyDecision = policy.evaluate(context.toolName, input);
      if (policyDecision === 'deny') return 'deny';
      const tool = tools[context.toolName];
      if (tool?.beforeApproval && await tool.beforeApproval(input)) return 'deny';
      let requiresApproval = false;
      try {
        requiresApproval = typeof tool?.requiresApproval === 'function'
          ? tool.requiresApproval(input)
          : tool?.requiresApproval === true;
      } catch {
        requiresApproval = true;
      }
      return policyDecision === 'ask' || requiresApproval ? 'ask' : 'allow';
    },
    policyVersion: async () => policy.getPolicyVersion(),
    approve,
  };
}
