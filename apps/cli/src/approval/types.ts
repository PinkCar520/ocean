import type { PermissionHookOutcome } from '@ocean/core/permission-policy';

/**
 * Unified approval decision kinds.
 *
 * - approved: user/hook granted this exact tool call.
 * - rejected: user/hook explicitly denied.
 * - cancelled: AbortSignal fired (Ctrl+C, turn interrupted).
 * - expired: approval window elapsed before a decision.
 * - unavailable: no approval channel exists (e.g. daemon, non-TTY without hook).
 * - policy_changed: local policy version drifted since the approval was requested.
 */
export type ApprovalDecisionKind =
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'unavailable'
  | 'policy_changed';

export interface ApprovalRequest {
  toolName: string;
  toolCallId?: string;
  args: Record<string, unknown>;
  sessionId: string;
  workspace: string;
  /** Policy fingerprint captured when the request was created. */
  policyVersion: string;
  signal?: AbortSignal;
  /** Deadline in ms from request creation; defaults to a sane per-mode value. */
  timeoutMs?: number;
}

export interface ApprovalDecision {
  kind: ApprovalDecisionKind;
  /** once = only this call; session = grant the exact args for the session. */
  scope?: 'once' | 'session';
  reason?: string;
  updatedInput?: Record<string, unknown>;
  updatedPermissions?: readonly unknown[];
  persistUpdates?: () => Promise<void>;
  interrupt?: boolean;
}

/**
 * Handler contract shared by interactive CLI, print, gateway and daemon modes.
 * Implementations must:
 *  - respect the AbortSignal (resolve with 'cancelled' on abort);
 *  - not resolve twice for the same toolCallId;
 *  - return 'unavailable' when no channel exists rather than approving.
 */
export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalDecision>;

/** Legacy hook-shaped outcome produced by PermissionRequest hooks. */
export type HookApproval = PermissionHookOutcome & { persistUpdates?: () => Promise<void> };

/** Convert the legacy string decision into the unified decision object. */
export function stringDecisionToApproval(
  value: 'approved' | 'rejected' | 'expired' | 'cancelled',
  reason?: string,
): ApprovalDecision {
  if (value === 'approved') return { kind: 'approved', scope: 'once' };
  if (value === 'expired') return { kind: 'expired', reason };
  if (value === 'cancelled') return { kind: 'cancelled', reason };
  return { kind: 'rejected', reason };
}

/** Convert a hook outcome into the unified decision object. */
export function hookOutcomeToApproval(outcome: HookApproval): ApprovalDecision {
  if (outcome.permission === 'allow') {
    return {
      kind: 'approved',
      scope: 'once',
      updatedInput: outcome.updatedInput,
      updatedPermissions: outcome.updatedPermissions,
      persistUpdates: outcome.persistUpdates,
    };
  }
  return {
    kind: 'rejected',
    reason: outcome.reason,
    interrupt: outcome.interrupt,
  };
}

/** True when the decision permits the tool call to proceed. */
export function isApproved(decision: ApprovalDecision): boolean {
  return decision.kind === 'approved';
}
