import { describe, expect, it } from 'vitest';
import { canReuseContextCache, validateContextBoundary, validateCompaction, ContextBudgetError } from './context-engine.js';

describe('Core v2 cross-host context contract', () => {
  it('rejects stale caches across session forks, history edits and budget changes', () => {
    const base = { sessionId: 's', boundary: 2, prefixFingerprint: 'hash', budgetTokens: 8192 };
    expect(canReuseContextCache(base, base)).toBe(true);
    expect(canReuseContextCache(base, { ...base, sessionId: 'fork' })).toBe(false);
    expect(canReuseContextCache(base, { ...base, prefixFingerprint: 'edited' })).toBe(false);
    expect(canReuseContextCache(base, { ...base, budgetTokens: 4096 })).toBe(false);
  });
  it('rejects a boundary that drops an invocation but retains its result', () => {
    const rows = [
      { role: 'user' },
      { role: 'tool_call', toolCallId: 'a' },
      { role: 'tool_result', toolCallId: 'a' },
      { role: 'assistant' },
    ];
    expect(() => validateContextBoundary(rows, 2)).toThrow(ContextBudgetError);
    expect(() => validateContextBoundary(rows, 3)).not.toThrow();
    expect(() => validateContextBoundary(rows, 5)).toThrow(ContextBudgetError);
  });
  it('rejects missing identities, duplicate outstanding calls and orphan results', () => {
    expect(() => validateContextBoundary([{ role: 'tool_call' }], 0)).toThrow(/missing invocation identity/);
    expect(() => validateContextBoundary([
      { role: 'tool_call', toolCallId: 'a' }, { role: 'tool_call', toolCallId: 'a' },
      { role: 'tool_result', toolCallId: 'a' },
    ], 0)).toThrow(/Duplicate tool invocation/);
    expect(() => validateContextBoundary([
      { role: 'tool_call', toolCallId: 'a' }, { role: 'tool_result', toolCallId: 'a' },
      { role: 'tool_call', toolCallId: 'a' }, { role: 'tool_result', toolCallId: 'a' },
    ], 0)).toThrow(/Duplicate tool invocation/);
    expect(() => validateContextBoundary([
      { role: 'tool_call', toolCallId: 'a' }, { role: 'tool_result', toolCallId: 'a' },
      { role: 'tool_result', toolCallId: 'a' },
    ], 0)).toThrow(/Duplicate tool result/);
    expect(() => validateContextBoundary([{ role: 'tool_result', toolCallId: 'a' }], 0))
      .toThrow(/no matching invocation/);
  });
  it('rejects compaction that does not reduce actual token count', () => {
    expect(() => validateCompaction({
      beforeTokens: 300, afterTokens: 300, budgetTokens: 1000,
      summaryValid: true, toolPairsClosed: true, preservesRequiredContext: true,
    })).toThrow(/did not reduce/);
  });
});
