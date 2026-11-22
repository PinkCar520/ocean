import { describe, expect, it } from 'vitest';
import { nextAgentExecutionDirective, planDurableModelDecision, planAgentExecutionResume, planAgentCompletion, planAgentFailure } from './agent-execution-engine.js';

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
  it('does not dispatch a sibling while its predecessor is pending in outbox', () => {
    const decision = { kind: 'tools' as const, calls };
    expect(planAgentExecutionResume(decision, new Set(), {
      unfinishedTool: false, pendingDeliveryIds: ['a'],
    })).toEqual({ kind: 'wait_for_host' });
    expect(planAgentExecutionResume(decision, new Set(['a']), {
      unfinishedTool: true, pendingDeliveryIds: [],
    })).toEqual({ kind: 'wait_for_host' });
    expect(planAgentExecutionResume(decision, new Set(['a']), {
      unfinishedTool: false, pendingDeliveryIds: [],
    })).toMatchObject({ kind: 'dispatch', call: calls[1] });
  });
  it('fails closed for inconsistent pending delivery or non-prefix journal', () => {
    const decision = { kind: 'tools' as const, calls };
    expect(() => planAgentExecutionResume(decision, new Set(), {
      unfinishedTool: false, pendingDeliveryIds: ['unrelated'],
    })).toThrow(/reconciliation/);
    expect(() => planAgentExecutionResume(decision, new Set(['b']), {
      unfinishedTool: true, pendingDeliveryIds: [],
    })).toThrow(/Non-contiguous/);
  });
  it('uses one completion policy for Stop hook rejection and verified termination', () => {
    expect(planAgentCompletion({ accepted: true })).toEqual({ kind: 'commit_completion' });
    expect(planAgentCompletion({ accepted: false, feedback: 'keep going' })).toEqual({
      kind: 'continue_model', feedback: 'keep going',
    });
    expect(planAgentCompletion({ accepted: false, feedback: ' ' })).toEqual({ kind: 'reject_completion' });
    expect(planAgentCompletion({ accepted: false })).toEqual({ kind: 'reject_completion' });
  });
  it('shares retry vs terminal failure semantics across hosts', () => {
    expect(planAgentFailure(true)).toEqual({ kind: 'retry', state: 'queued' });
    expect(planAgentFailure(false)).toEqual({ kind: 'terminate', state: 'failed' });
  });
  it('cannot declare completion with outstanding claims', () => {
    expect(() => nextAgentExecutionDirective({ kind: 'complete', text: 'done' }, { claimedIds: new Set(['a']) })).toThrow(/Cannot complete/);
  });
});
