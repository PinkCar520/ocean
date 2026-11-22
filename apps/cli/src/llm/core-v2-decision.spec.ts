import { describe, expect, it } from 'vitest';
import { planDurableModelDecision, validateAgentModelDecision } from '@ocean/core';

describe('Core v2 shared model decision contract', () => {
  it('accepts a text-only completion', () => {
    expect(planDurableModelDecision({ kind: 'complete', text: 'done' })).toEqual({ kind: 'complete', text: 'done' });
  });

  it('dispatches the first tool and resumes the next settled sibling', () => {
    const calls = [
      { id: 'first', name: 'read', input: { path: 'a' } },
      { id: 'second', name: 'read', input: { path: 'b' } },
    ];
    expect(planDurableModelDecision({ kind: 'tools', calls })).toMatchObject({ kind: 'dispatch', call: calls[0] });
    expect(planDurableModelDecision({ kind: 'tools', calls }, new Set(['first']))).toMatchObject({ kind: 'dispatch', call: calls[1] });
    expect(planDurableModelDecision({ kind: 'tools', calls }, new Set(['first', 'second']))).toEqual({ kind: 'awaiting_results' });
  });

  it('never skips an unresolved earlier effect or accepts a non-prefix journal', () => {
    const calls = [
      { id: 'first', name: 'write', input: {} },
      { id: 'second', name: 'write', input: {} },
    ];
    expect(() => planDurableModelDecision({ kind: 'tools', calls }, new Set(['first']), true)).toThrow(/unresolved/);
    expect(() => planDurableModelDecision({ kind: 'tools', calls }, new Set(['second']))).toThrow(/Non-contiguous/);
    expect(() => planDurableModelDecision({ kind: 'tools', calls }, new Set(['other']))).toThrow(/Non-contiguous|absent/);
  });

  it('rejects malformed or non-replayable model output before side effects', () => {
    expect(() => validateAgentModelDecision({ kind: 'tools', calls: [] })).toThrow(/empty/);
    expect(() => validateAgentModelDecision({ kind: 'tools', calls: [
      { id: 'same', name: 'read', input: {} }, { id: 'same', name: 'write', input: {} },
    ] })).toThrow(/duplicate/);
    expect(() => validateAgentModelDecision({ kind: 'tools', calls: [
      { id: 'bad', name: 'write', input: undefined },
    ] })).toThrow(/non-serializable/);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => validateAgentModelDecision({ kind: 'tools', calls: [
      { id: 'cycle', name: 'write', input: cyclic },
    ] })).toThrow(/non-serializable/);
  });
});
