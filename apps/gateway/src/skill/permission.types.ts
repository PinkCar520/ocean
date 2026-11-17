/** Backwards-compatible Gateway imports for Ocean's shared policy contract. */
export {
  IS_PUBLIC_KEY,
  evaluateTool,
  evaluateToolDecision,
  evaluatePermissionDecision,
  permissionPolicyVersion,
  isPermissionSettings,
  isReadOnlyTool,
  matchRule,
  normalizeRules,
  wildcardToRegex,
} from '@ocean/core';
export type {
  NormalizedRule,
  PermissionAction,
  PermissionMode,
  PermissionRule,
  PermissionSettings,
  PermissionDecision,
} from '@ocean/core';
