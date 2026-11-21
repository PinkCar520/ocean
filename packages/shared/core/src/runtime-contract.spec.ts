import { describe, expect, it } from 'vitest';
import { canTransition, replayRuntime, type RuntimeEvent } from './runtime-contract.js';

describe('portable runtime contract', () => {
 const runId = 'run-1';
 const created: RuntimeEvent = { type: 'run.created', runId, at: '2026-01-01T00:00:00Z' };
 const transition = (from: any, to: any): RuntimeEvent =>
  ({ type: 'run.transitioned', runId, at: '2026-01-01T00:00:00Z', from, to });

 it('replays a completed model-only run without a UI host', () => {
  const events = [created, transition('created', 'preparing_context'), transition('preparing_context', 'calling_model'), transition('calling_model', 'completed')];
  expect(replayRuntime(runId, events)).toMatchObject({ state: 'completed', revision: 4 });
 });
 it('rejects invalid terminal transitions', () => {
  expect(canTransition('completed', 'calling_model')).toBe(false);
  expect(() => replayRuntime(runId, [created, transition('created', 'completed')])).toThrow('Invalid runtime transition');
 });
 it('blocks completion while a tool result is unknown', () => {
  const invocation = { id: 'tool-1', runId, toolName: 'shell', input: {}, inputDigest: 'digest', host: 'local' as const };
  const events: RuntimeEvent[] = [
   created, transition('created', 'preparing_context'), transition('preparing_context', 'calling_model'),
   transition('calling_model', 'validating_tools'), transition('validating_tools', 'executing_tools'),
   { type: 'tool.prepared', runId, at: '2026-01-01T00:00:00Z', invocation },
   { type: 'tool.settled', runId, at: '2026-01-01T00:00:00Z', invocationId: 'tool-1', outcome: 'unknown' },
   transition('executing_tools', 'persisting_results'),
  ];
  expect(() => replayRuntime(runId, [...events, transition('persisting_results', 'completed')])).toThrow('unsettled tools');
 });
});
