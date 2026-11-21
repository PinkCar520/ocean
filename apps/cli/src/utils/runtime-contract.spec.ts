import { describe, expect, it } from 'vitest';
import { canTransition, replayRuntime, type RuntimeEvent } from '@ocean/core';

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

import { MemoryRuntimeEventStore } from '@ocean/core';

describe('runtime event store adapter', () => {
 it('enforces optimistic concurrency and does not mutate on invalid transitions', async () => {
  const store = new MemoryRuntimeEventStore();
  const created = { type: 'run.created' as const, runId: 'r', at: '2026-01-01T00:00:00Z' };
  expect(await store.append('r', 0, [created])).toBe(1);
  await expect(store.append('r', 0, [created])).rejects.toThrow('revision conflict');
  await expect(store.append('r', 1, [{
   type: 'run.transitioned', runId: 'r', at: created.at, from: 'created', to: 'completed',
  }])).rejects.toThrow('Invalid runtime transition');
  expect(await store.read('r')).toEqual([created]);
 });
});

import { AgentRuntime } from '@ocean/core';

describe('host-neutral agent runtime', () => {
 const setup = async (execute: (invocation: any) => Promise<unknown>) => {
  const store = new MemoryRuntimeEventStore();
  const runtime = new AgentRuntime(store, { execute });
  await runtime.create('r');
  await runtime.transition('r', 'preparing_context');
  await runtime.transition('r', 'calling_model');
  await runtime.transition('r', 'validating_tools');
  await runtime.transition('r', 'executing_tools');
  return { runtime, store };
 };
 it('persists a tool claim before invoking the host and prevents replay', async () => {
  let calls = 0;
  let store!: MemoryRuntimeEventStore;
  const setupResult = await setup(async () => {
   calls++;
   const events = await store.read('r');
   expect(events.at(-1)?.type).toBe('tool.prepared');
   return { ok: true };
  });
  store = setupResult.store;
  const { runtime } = setupResult;
  await expect(runtime.executeTool('r', 'call', 'shell', { cmd: 'echo hi' }, 'local')).resolves.toEqual({ ok: true });
  await expect(runtime.executeTool('r', 'call', 'shell', { cmd: 'echo hi' }, 'local')).rejects.toThrow('replay prohibited');
  expect(calls).toBe(1);
 });
 it('fails closed on uncertain external side effects', async () => {
  let calls = 0;
  const { runtime } = await setup(async () => { calls++; throw new Error('connection lost'); });
  await expect(runtime.executeTool('r', 'call', 'remote', {}, 'remote')).rejects.toThrow('manual reconciliation');
  expect((await runtime.snapshot('r')).pendingTools.call).toBe('unknown');
  await expect(runtime.executeTool('r', 'call', 'remote', {}, 'remote')).rejects.toThrow('replay prohibited');
  expect(calls).toBe(1);
  await runtime.transition('r', 'persisting_results');
  await expect(runtime.transition('r', 'completed')).rejects.toThrow('unsettled tools');
 });
});

describe('runtime replay input validation', () => {
 it('rejects transitions without a creation event', () => {
  expect(() => replayRuntime('r', [{
   type: 'run.transitioned', runId: 'r', at: '2026-01-01T00:00:00Z',
   from: 'created', to: 'preparing_context',
  }])).toThrow('missing creation');
 });
 it('rejects empty streams and foreign run identities', () => {
  expect(() => replayRuntime('r', [])).toThrow('missing creation');
  expect(() => replayRuntime('r', [{
   type: 'run.created', runId: 'foreign', at: '2026-01-01T00:00:00Z',
  }])).toThrow('another run');
 });
});
