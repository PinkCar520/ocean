/** Backwards-compatible Gateway imports for Ocean's shared policy contract. */
export {
  IS_PUBLIC_KEY,
  evaluateTool,
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
} from '@ocean/core';
