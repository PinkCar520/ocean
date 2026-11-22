import { describe, expect, it } from 'vitest';
import { nextAgentExecutionDirective, planDurableModelDecision } from './agent-execution-engine.js';

const calls = [
  { id: 'a', name: 'read', input: { path: 'one' } },
  { id: 'b', name: 'write', input: { path: 'two' } },
];

describe('shared inline/durable execution protocol', () => {
  it('completes text without tools in either driver', () => {
    const decision = { kind: 'complete' as const, text: 'ok' };
    expect(nextAgentExecutionDirective(decision)).toEqual(planDurableModelDecision(decision));
  });
  it('dispatches one sequential invocation at a time across both drivers', () => {
    const decision = { kind: 'tools' as const, calls };
    const claimed = new Set<string>();
    for (const call of calls) {
      expect(nextAgentExecutionDirective(decision, { claimedIds: claimed })).toMatchObject({ kind: 'dispatch', call });
      expect(planDurableModelDecision(decision, claimed)).toMatchObject({ kind: 'dispatch', call });
      claimed.add(call.id);
    }
    expect(nextAgentExecutionDirective(decision, { claimedIds: claimed })).toEqual({ kind: 'awaiting_results' });
  });
  it('refuses non-prefix claims and unknown journal entries', () => {
    expect(() => nextAgentExecutionDirective({ kind: 'tools', calls }, { claimedIds: new Set(['b']) })).toThrow(/Non-contiguous/);
    expect(() => nextAgentExecutionDirective({ kind: 'tools', calls }, { claimedIds: new Set(['missing']) })).toThrow(/absent/);
  });
  it('blocks dispatch while an earlier external effect is unresolved', () => {
    expect(() => nextAgentExecutionDirective({ kind: 'tools', calls }, { claimedIds: new Set(['a']), unresolved: true })).toThrow(/unresolved/);
  });
  it('cannot declare completion with outstanding claims', () => {
    expect(() => nextAgentExecutionDirective({ kind: 'complete', text: 'done' }, { claimedIds: new Set(['a']) })).toThrow(/Cannot complete/);
  });
});
