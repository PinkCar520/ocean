import type { ToolAuthorization, ToolPolicyContext } from '@ocean/core';
import type { PermissionPolicy } from '../utils/permission-policy.js';

/** Bridge existing CLI layered permissions to shared Tool Runtime.
 * Approval remains an explicit host callback; a missing callback fails closed.
 */
export function createCliToolAuthorization(
  policy: PermissionPolicy,
  approve?: (context: ToolPolicyContext) => Promise<boolean>,
): ToolAuthorization {
  return {
    evaluate: async context => {
      const action = policy.evaluate(context.toolName, context.input as Record<string, unknown>);
      return action;
    },
    policyVersion: async () => policy.getPolicyVersion(),
    approve,
  };
}
