import type { ToolAuthorization, ToolPolicyContext } from '@ocean/core';
import { PermissionService } from '../skill/permission.service';

/** Gateway's existing layered policy is authoritative for shared Tool Runtime. */
export function createGatewayToolAuthorization(
  permissions: PermissionService,
  workspace?: string,
  approve?: (context: ToolPolicyContext) => Promise<boolean>,
): ToolAuthorization {
  return {
    evaluate: async context => permissions.evaluateToolDecision(
      context.toolName, workspace, context.input,
    ).action,
    policyVersion: async () => permissions.getPolicyVersion(workspace),
    approve,
  };
}
