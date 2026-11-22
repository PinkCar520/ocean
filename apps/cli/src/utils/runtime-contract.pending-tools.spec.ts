import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { replayRuntime, type RuntimeEvent } from '@ocean/core';

const runId = 'pending-batch';
const at = '2026-11-22T00:00:00.000Z';
const digest = createHash('sha256').update(JSON.stringify({ value: 1 })).digest('hex');
const base: RuntimeEvent[] = [
  { type: 'run.created', runId, sessionId: 'session', at },
  { type: 'run.transitioned', runId, at, from: 'created', to: 'preparing_context' },
  { type: 'run.transitioned', runId, at, from: 'preparing_context', to: 'calling_model' },
  { type: 'run.transitioned', runId, at, from: 'calling_model', to: 'validating_tools' },
  { type: 'tool.proposed', runId, at, invocationId: 'first', toolName: 'read', inputDigest: digest },
  { type: 'tool.proposed', runId, at, invocationId: 'second', toolName: 'write', inputDigest: digest },
  { type: 'run.transitioned', runId, at, from: 'validating_tools', to: 'executing_tools' },
  { type: 'tool.prepared', runId, at, invocation: { id: 'first', runId, toolName: 'read', input: { value: 1 }, inputDigest: digest, host: 'local' } },
  { type: 'tool.settled', runId, at, invocationId: 'first', outcome: 'succeeded', result: 'ok' },
  { type: 'run.transitioned', runId, at, from: 'executing_tools', to: 'persisting_results' },
];

describe('unclaimed model tool proposals', () => {
  it('rejects completion verification while a second proposed call has not been claimed', () => {
    expect(() => replayRuntime(runId, [...base, {
      type: 'run.completion_verified', runId, at, checks: ['verified'],
    }])).toThrow('Invalid completion verification');
  });

  it('rejects a completed transition even with an earlier completion certificate', () => {
    // A certificate cannot bypass an unclaimed model-declared tool.
    expect(() => replayRuntime(runId, [...base, {
      type: 'run.completion_verified', runId, at, checks: ['verified'],
    }, {
      type: 'run.transitioned', runId, at, from: 'persisting_results', to: 'completed',
    }])).toThrow('Invalid completion verification');
  });

  it('allows verification once every proposed tool has been prepared and settled', () => {
    const events: RuntimeEvent[] = [
      ...base.slice(0, -1),
      { type: 'tool.prepared', runId, at, invocation: { id: 'second', runId, toolName: 'write', input: { value: 1 }, inputDigest: digest, host: 'local' } },
      { type: 'tool.settled', runId, at, invocationId: 'second', outcome: 'succeeded', result: 'ok' },
      base[base.length - 1],
      { type: 'run.completion_verified', runId, at, checks: ['verified'] },
      { type: 'run.transitioned', runId, at, from: 'persisting_results', to: 'completed' },
    ];
    expect(replayRuntime(runId, events).state).toBe('completed');
  });
});
