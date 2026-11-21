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
