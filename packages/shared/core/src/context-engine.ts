/** Host-neutral context layers and post-compaction acceptance contract. */
export interface ContextLayers<T> {
  /** Immutable constraints and current task intent. Never summarized away. */
  l0: readonly T[];
  /** Recent dialogue and active tool calls. */
  l1: readonly T[];
  /** Durable history and decisions, fetched only when relevant. */
  l2: readonly T[];
}
export interface ContextBudgetEvidence {
  beforeTokens: number;
  afterTokens: number;
  budgetTokens: number;
  summaryValid: boolean;
  toolPairsClosed: boolean;
  preservesRequiredContext: boolean;
}
export class ContextBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextBudgetError';
  }
}
/** Reject any purported compaction which does not actually reduce and fit. */
export function validateCompaction(evidence: ContextBudgetEvidence): void {
  const { beforeTokens, afterTokens, budgetTokens } = evidence;
  if (![beforeTokens, afterTokens, budgetTokens].every(Number.isSafeInteger) ||
      beforeTokens < 0 || afterTokens < 0 || budgetTokens <= 0)
    throw new ContextBudgetError('Invalid context token accounting');
  if (!evidence.summaryValid || !evidence.toolPairsClosed || !evidence.preservesRequiredContext)
    throw new ContextBudgetError('Compaction violates context integrity');
  if (afterTokens >= beforeTokens) throw new ContextBudgetError('Compaction did not reduce token estimate');
  if (afterTokens >= budgetTokens) throw new ContextBudgetError('Compaction exceeds effective context budget');
}
export function assembleContext<T>(layers: ContextLayers<T>): T[] {
  return [...layers.l0, ...layers.l2, ...layers.l1];
}

/** A history compaction boundary must not separate a tool call from its
 * result. Unknown structured rows are retained rather than silently erased.
 */
export function validateHistoryCompactionBoundary(
  history: readonly unknown[],
  boundary: number,
): void {
  if (!Number.isSafeInteger(boundary) || boundary < 0 || boundary > history.length)
    throw new ContextBudgetError('Invalid history compaction boundary');
  for (let index = 0; index < boundary; index++) {
    const row = history[index];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    // Text-only chat turns can be summarized; structured tool events require
    // the host to prove the pair is closed before dropping either side.
    if (record.toolCalls !== undefined || record.toolResults !== undefined ||
        record.toolCallId !== undefined || record.toolResult !== undefined ||
        record.role === 'tool')
      throw new ContextBudgetError('Cannot compact structured tool history without journal reconciliation');
  }
}

/** An old cached summary is only reusable when it fits the same effective
 * budget and its immutable history prefix has been verified by the host.
 */
export function validateCachedCompaction(
  beforeTokens: number, afterTokens: number, budgetTokens: number,
  history: readonly unknown[], boundary: number,
): void {
  validateHistoryCompactionBoundary(history, boundary);
  validateCompaction({
    beforeTokens, afterTokens, budgetTokens,
    summaryValid: true, toolPairsClosed: true, preservesRequiredContext: true,
  });
}

/** Immutable prefix identity: compaction caches are never portable across edits or forks. */
export interface ContextCacheIdentity {
  sessionId: string;
  boundary: number;
  prefixFingerprint: string;
  budgetTokens: number;
}
export function canReuseContextCache(
  cached: ContextCacheIdentity,
  current: ContextCacheIdentity,
): boolean {
  return Boolean(current.sessionId && current.prefixFingerprint) &&
    Number.isSafeInteger(current.boundary) && current.boundary > 0 &&
    Number.isSafeInteger(current.budgetTokens) && current.budgetTokens > 0 &&
    cached.sessionId === current.sessionId &&
    cached.boundary === current.boundary &&
    cached.prefixFingerprint === current.prefixFingerprint &&
    cached.budgetTokens === current.budgetTokens;
}

/** Compaction must preserve complete tool-call/result pairs and active instructions. */
export function validateContextBoundary(
  messages: readonly { role: string; toolCallId?: string }[],
  boundary: number,
): void {
  if (!Number.isSafeInteger(boundary) || boundary < 0 || boundary > messages.length)
    throw new ContextBudgetError('Invalid compaction boundary');
  const calls = new Set<string>();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === 'tool_call' && message.toolCallId) calls.add(message.toolCallId);
    if (message.role === 'tool_result' && message.toolCallId) {
      if (!calls.has(message.toolCallId))
        throw new ContextBudgetError('Tool result has no matching invocation');
      calls.delete(message.toolCallId);
    }
    if (i === boundary - 1 && calls.size)
      throw new ContextBudgetError('Compaction boundary splits a tool invocation and result');
  }
  if (calls.size) throw new ContextBudgetError('Unsettled tool invocation in context');
}
