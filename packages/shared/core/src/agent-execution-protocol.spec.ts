import { describe, expect, it } from 'vitest';
import { validateCachedCompaction, validateHistoryCompactionBoundary } from './context-engine.js';
import { AgentExecutionDriver, planAgentTurn, nextAgentExecutionDirective, planDurableModelDecision, planAgentExecutionResume, planAgentCompletion, planAgentFailure } from './agent-execution-engine.js';

const calls = [
  { id: 'a', name: 'read', input: { path: 'one' } },
  { id: 'b', name: 'write', input: { path: 'two' } },
];

describe('shared inline/durable execution protocol', () => {
  it('rejects missing or blank session identifiers for durable resume', async () => {
    const { AgentExecutionEngine } = await import('./agent-execution-engine.js');
    const { MemoryRuntimeEventStore } = await import('./runtime-memory-store.js');
    const engine = AgentExecutionEngine.durable(new MemoryRuntimeEventStore());
    await expect(engine.assertDurableSession('run', '')).rejects.toThrow(/required/);
    await engine.startDurableModel('run', 'session-a');
    await expect(engine.assertDurableSession('run', 'session-b')).rejects.toThrow(/mismatch/);
    await expect(engine.assertDurableSession('run', 'session-a')).resolves.toBeUndefined();
  });
  it('uses one production driver for inline and durable model turns', () => {
    const driver = new AgentExecutionDriver();
    const decision = { kind: 'tools' as const, calls };
    expect(driver.decide(decision)).toMatchObject({ kind: 'dispatch', call: calls[0] });
    expect(driver.resume(decision, new Set(['a']), {
      unfinishedTool: false, pendingDeliveryIds: [],
    })).toMatchObject({ kind: 'dispatch', call: calls[1] });
    expect(driver.resume(decision, new Set(['a']), {
      unfinishedTool: true, pendingDeliveryIds: [],
    })).toEqual({ kind: 'wait_for_host' });
    expect(driver.completion(true)).toEqual({ kind: 'commit_completion' });
    expect(driver.completion(false, 'continue')).toEqual({ kind: 'continue_model', feedback: 'continue' });
    expect(driver.failure(true)).toEqual({ kind: 'retry', state: 'queued' });
    expect(driver.failure(false)).toEqual({ kind: 'terminate', state: 'failed' });
  });
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

describe('Core v2 context integrity acceptance', () => {
  it('accepts a closed plain-text history prefix', () => {
    expect(() => validateHistoryCompactionBoundary([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'ok' }], 2)).not.toThrow();
  });
  it('refuses to summarize a structured tool invocation', () => {
    expect(() => validateHistoryCompactionBoundary([{ role: 'assistant', toolCalls: [{ id: 'a' }] }], 1)).toThrow(/structured tool/);
  });
  it('refuses non-reducing cached summaries', () => {
    expect(() => validateCachedCompaction(100, 100, 200, [{ role: 'user', text: 'hello' }], 1)).toThrow(/did not reduce/);
  });
});

describe('R01 Core turn orchestration contract', () => {
  it('never calls model when an external effect is unresolved', () => {
    expect(planAgentTurn({ cancelled: false, unfinishedTool: true, pendingDeliveryIds: [] }))
      .toEqual({ kind: 'wait_for_host' });
    expect(planAgentTurn({ cancelled: false, unfinishedTool: false, pendingDeliveryIds: ['pending'] }))
      .toEqual({ kind: 'wait_for_host' });
  });
  it('honors cancellation before dispatch or model calls', () => {
    expect(planAgentTurn({ cancelled: true, unfinishedTool: false, pendingDeliveryIds: [] }))
      .toEqual({ kind: 'cancel' });
  });
  it('does not commit completion while a tool or outbox delivery remains unresolved', () => {
    const complete = { kind: 'complete' as const, text: 'done' };
    expect(planAgentTurn({ cancelled: false, unfinishedTool: true, pendingDeliveryIds: [],
      modelDecision: complete })).toEqual({ kind: 'wait_for_host' });
    expect(() => planAgentTurn({ cancelled: false, unfinishedTool: false, pendingDeliveryIds: ['delivery'],
      modelDecision: complete })).toThrow(/journal reconciliation required/);
    expect(planAgentTurn({ cancelled: false, unfinishedTool: false, pendingDeliveryIds: [],
      modelDecision: complete })).toEqual({ kind: 'complete', text: 'done' });
  });
  it('requests model only when no outstanding host work remains', () => {
    expect(planAgentTurn({ cancelled: false, unfinishedTool: false, pendingDeliveryIds: [] }))
      .toEqual({ kind: 'call_model' });
  });
  it('dispatches only the next journal-safe tool', () => {
    const decision = { kind: 'tools' as const, calls };
    expect(planAgentTurn({ cancelled: false, unfinishedTool: false, pendingDeliveryIds: [],
      modelDecision: decision, claimedIds: new Set(['a']) })).toMatchObject({ kind: 'dispatch', call: calls[1] });
  });
});
