import { randomUUID } from 'node:crypto';
import type { ApprovalDecision, ApprovalRequest } from './types.js';

export interface PendingApproval {
  id: string;
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
}

interface CoordinatorOptions {
  /** Called when the user chooses "Allow for this session". */
  grantSession?: (toolName: string, args: Record<string, unknown>) => void;
  defaultTimeoutMs?: number;
}

/**
 * Bridges the tool approval gate and the Ink UI.
 *
 * The gate calls `request()` which returns a promise. The Ink app subscribes
 * to `getPending()` and renders a prompt for the first pending approval. When
 * the user decides, `decide()` resolves the promise.
 *
 * Safety properties:
 *  - Each toolCallId maps to at most one pending approval (single-consume).
 *  - AbortSignal cancels the wait promptly.
 *  - A timeout resolves with 'expired'.
 *  - Duplicate decide() calls for the same id are ignored.
 */
export class InkApprovalCoordinator {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly listeners = new Set<() => void>();
  private readonly grantSession?: (toolName: string, args: Record<string, unknown>) => void;
  private readonly defaultTimeoutMs: number;

  constructor(options: CoordinatorOptions = {}) {
    this.grantSession = options.grantSession;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 24 * 60 * 60 * 1000;
  }

  request(request: ApprovalRequest): Promise<ApprovalDecision> {
    // Use the toolCallId when available so concurrent approvals stay isolated.
    // Fall back to a generated id; the gate still correlates by toolCallId.
    const id = request.toolCallId ?? randomUUID();
    if (this.pending.has(id)) {
      // Defensive: the same tool call must not be approved twice.
      return Promise.resolve({ kind: 'cancelled', reason: 'Duplicate approval request for the same tool call.' });
    }
    return new Promise<ApprovalDecision>((resolve) => {
      const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
      const timer = setTimeout(() => this.finish(id, { kind: 'expired', reason: 'Approval timed out.' }), timeoutMs);
      const onAbort = () => this.finish(id, { kind: 'cancelled', reason: 'Approval cancelled by signal.' });
      request.signal?.addEventListener('abort', onAbort, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onAbort);
      };
      const pending: PendingApproval & { cleanup: () => void } = {
        id,
        request,
        resolve,
        cleanup,
      };
      this.pending.set(id, pending);
      this.notify();
    });
  }

  /** Resolve a pending approval. Returns false if the id is not pending. */
  decide(id: string, decision: ApprovalDecision): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    if (decision.kind === 'approved' && decision.scope === 'session') {
      try {
        this.grantSession?.(pending.request.toolName, pending.request.args);
      } catch {
        // If the session grant is rejected by policy (e.g. managed mode),
        // fall back to a one-off approval for this call only.
      }
    }
    return this.finish(id, { ...decision, scope: decision.kind === 'approved' ? 'once' : decision.scope });
  }

  cancelAll(reason = 'Coordinator closed.'): void {
    for (const id of [...this.pending.keys()]) {
      this.finish(id, { kind: 'cancelled', reason });
    }
  }

  getPending(): PendingApproval[] {
    return [...this.pending.values()];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private finish(id: string, decision: ApprovalDecision): boolean {
    const pending = this.pending.get(id) as (PendingApproval & { cleanup?: () => void }) | undefined;
    if (!pending) return false;
    this.pending.delete(id);
    pending.cleanup?.();
    pending.resolve(decision);
    this.notify();
    return true;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
