import { describe, expect, it } from 'vitest';
import { canTransition, replayRuntime, type RuntimeEvent } from '@ocean/core';

describe('portable runtime contract', () => {
 const runId = 'run-1';
 const created: RuntimeEvent = { type: 'run.created', runId, at: '2026-01-01T00:00:00Z' };
 const transition = (from: any, to: any): RuntimeEvent =>
  ({ type: 'run.transitioned', runId, at: '2026-01-01T00:00:00Z', from, to });

 it('replays a completed model-only run without a UI host', () => {
  const events = [created, transition('created', 'preparing_context'), transition('preparing_context', 'calling_model'), { type: 'run.completion_verified', runId, at: '2026-01-01T00:00:00Z', checks: ['model output validated'] } as RuntimeEvent, transition('calling_model', 'completed')];
  expect(replayRuntime(runId, events)).toMatchObject({ state: 'completed', revision: 5 });
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

describe('explicit tool outcome reconciliation', () => {
 it('does not replay unknown side effects when reconciled', async () => {
  let calls = 0;
  const store = new MemoryRuntimeEventStore();
  const runtime = new AgentRuntime(store, { execute: async () => { calls++; throw new Error('timeout'); } });
  await runtime.create('r');
  for (const state of ['preparing_context', 'calling_model', 'validating_tools', 'executing_tools'] as const) await runtime.transition('r', state);
  await expect(runtime.executeTool('r', 'x', 'remote', { id: 1 }, 'remote')).rejects.toThrow('unknown');
  expect(calls).toBe(1);
  expect((await runtime.reconcileTool('r', 'x', 'succeeded', { verified: true })).pendingTools.x).toBe('succeeded');
  await expect(runtime.reconcileTool('r', 'x', 'succeeded', {})).rejects.toThrow('Only unknown');
  await runtime.transition('r', 'persisting_results');
  await runtime.verifyCompletion('r', ['host checked tool result']);
  expect((await runtime.transition('r', 'completed')).state).toBe('completed');
  expect(calls).toBe(1);
 });
});

describe('session and run isolation', () => {
 it('supports independent runs within one session', async () => {
  const store = new MemoryRuntimeEventStore();
  const runtime = new AgentRuntime(store, { execute: async () => ({ ok: true }) });
  await runtime.create('run-a', 'session-1');
  await runtime.create('run-b', 'session-1');
  await runtime.transition('run-a', 'preparing_context');
  expect(await runtime.snapshot('run-a')).toMatchObject({ sessionId: 'session-1', state: 'preparing_context' });
  expect(await runtime.snapshot('run-b')).toMatchObject({ sessionId: 'session-1', state: 'created' });
 });
 it('rejects unsupported event schema versions and preserves existing stream', async () => {
  const store = new MemoryRuntimeEventStore();
  await expect(store.append('r', 0, [{
   type: 'run.created', runId: 'r', at: '2026-01-01T00:00:00Z', schemaVersion: 2,
  } as unknown as RuntimeEvent])).rejects.toThrow('Unsupported runtime event schema');
  expect(await store.read('r')).toEqual([]);
 });
});

import { ToolRuntime } from '@ocean/core';

describe('shared tool authorization pipeline', () => {
 const make = async (policy: () => Promise<'allow' | 'deny' | 'ask'>, approve?: () => Promise<boolean>) => {
  const store = new MemoryRuntimeEventStore();
  let calls = 0;
  const agent = new AgentRuntime(store, { execute: async () => { calls++; return 'ok'; } });
  await agent.create('r');
  for (const state of ['preparing_context', 'calling_model', 'validating_tools', 'executing_tools'] as const) await agent.transition('r', state);
  const runtime = new ToolRuntime(store, { execute: async () => { calls++; return 'ok'; } }, { evaluate: policy, approve });
  return { runtime, store, calls: () => calls };
 };
 const descriptor = { name: 'shell', host: 'local' as const, validate: (input: unknown) => {
  if (!input || typeof input !== 'object') throw new Error('Invalid input');
  return input;
 } };
 it('denies tool calls without preparing a journal entry', async () => {
  const { runtime, store, calls } = await make(async () => 'deny');
  await expect(runtime.invoke('r', 'x', descriptor, {})).rejects.toThrow('denied');
  expect(calls()).toBe(0);
  expect((await store.read('r')).filter(e => e.type === 'tool.prepared')).toHaveLength(0);
 });
 it('does not execute without explicit approval', async () => {
  const { runtime, calls } = await make(async () => 'ask', async () => false);
  await expect(runtime.invoke('r', 'x', descriptor, {})).rejects.toThrow('approval required');
  expect(calls()).toBe(0);
 });
 it('rechecks policy after approval', async () => {
  let checks = 0;
  const { runtime, calls } = await make(async () => (++checks === 1 ? 'ask' : 'deny'), async () => true);
  await expect(runtime.invoke('r', 'x', descriptor, {})).rejects.toThrow('denied after approval');
  expect(calls()).toBe(0);
 });
 it('executes an allowed invocation through the shared host', async () => {
  const { runtime, calls } = await make(async () => 'allow');
  await expect(runtime.invoke('r', 'x', descriptor, { cmd: 'pwd' })).resolves.toBe('ok');
  expect(calls()).toBe(1);
 });
});

describe('tool approval integrity', () => {
 it('rejects policy drift after an approval prompt', async () => {
  const store = new MemoryRuntimeEventStore();
  const agent = new AgentRuntime(store, { execute: async () => 'should-not-run' });
  await agent.create('r');
  for (const state of ['preparing_context', 'calling_model', 'validating_tools', 'executing_tools'] as const) await agent.transition('r', state);
  let version = 'v1';
  let calls = 0;
  const runtime = new ToolRuntime(store, { execute: async () => { calls++; return 'bad'; } }, {
   evaluate: async () => 'ask',
   approve: async () => { version = 'v2'; return true; },
   policyVersion: async () => version,
  });
  await expect(runtime.invoke('r', 'x', { name: 'shell', host: 'local', validate: x => x }, {}))
   .rejects.toThrow('policy change');
  expect(calls).toBe(0);
 });
});

import { assembleContext, validateCompaction } from '@ocean/core';

describe('shared context acceptance', () => {
 it('preserves mandatory context while composing layers', () => {
  expect(assembleContext({ l0: ['system', 'goal'], l1: ['latest'], l2: ['decision'] }))
   .toEqual(['system', 'goal', 'decision', 'latest']);
 });
 it('rejects summaries that grow, exceed budget or break tool relationships', () => {
  const valid = { beforeTokens: 900, afterTokens: 400, budgetTokens: 800,
   summaryValid: true, toolPairsClosed: true, preservesRequiredContext: true };
  expect(() => validateCompaction(valid)).not.toThrow();
  expect(() => validateCompaction({ ...valid, afterTokens: 901 })).toThrow('did not reduce');
  expect(() => validateCompaction({ ...valid, afterTokens: 800 })).toThrow('exceeds');
  expect(() => validateCompaction({ ...valid, toolPairsClosed: false })).toThrow('integrity');
 });
});

import { resolveSkills, skillAllowedTools } from '@ocean/core';

describe('skills runtime policy boundary', () => {
 it('prefers project definitions and rejects same-source name conflicts', () => {
  const plugin = { id: 'plugin/a', name: 'review', source: 'plugin' as const };
  const project = { id: 'project/a', name: 'review', source: 'project' as const };
  expect(resolveSkills([project, plugin])).toEqual([project]);
  expect(() => resolveSkills([plugin, { ...plugin, id: 'plugin/b' }])).toThrow('Conflicting');
 });
 it('never grants tools absent from host policy', () => {
  const skill = { id: 'a', name: 'a', source: 'project' as const, allowedTools: ['shell', 'read', 'admin'] };
  expect(skillAllowedTools(skill, ['read'])).toEqual(['read']);
  expect(skillAllowedTools({ ...skill, allowedTools: undefined }, ['read'])).toEqual(['read']);
 });
});

describe('tool result normalization', () => {
 it('bounds oversized host outputs before they enter the event journal', async () => {
  const store = new MemoryRuntimeEventStore();
  const agent = new AgentRuntime(store, { execute: async () => undefined });
  await agent.create('r');
  for (const state of ['preparing_context', 'calling_model', 'validating_tools', 'executing_tools'] as const) await agent.transition('r', state);
  const runtime = new ToolRuntime(store, { execute: async () => 'x'.repeat(2 * 1024 * 1024) }, {
   evaluate: async () => 'allow',
  });
  const result = await runtime.invoke('r', 'x', { name: 'large', host: 'local', validate: x => x }, {});
  expect(result).toEqual({ truncated: true, error: 'Tool output exceeded 1 MiB limit' });
  const events = await store.read('r');
  expect(JSON.stringify(events).length).toBeLessThan(4096);
 });
});

describe('completion evidence', () => {
 it('rejects model-only completion without independent checks', async () => {
  const store = new MemoryRuntimeEventStore();
  const runtime = new AgentRuntime(store, { execute: async () => null });
  await runtime.create('r');
  await runtime.transition('r', 'preparing_context');
  await runtime.transition('r', 'calling_model');
  await expect(runtime.transition('r', 'completed')).rejects.toThrow('independent verification');
  await expect(runtime.verifyCompletion('r', [])).rejects.toThrow('Invalid completion verification');
  await runtime.verifyCompletion('r', ['host validated acceptance']);
  expect((await runtime.transition('r', 'completed')).state).toBe('completed');
 });
});

describe('skill activation replay', () => {
 it('recovers active skills from persisted run events', async () => {
  const store = new MemoryRuntimeEventStore();
  const runtime = new AgentRuntime(store, { execute: async () => undefined });
  await runtime.create('r', 'session');
  await runtime.activateSkill('r', 'review', 'project');
  const restarted = new AgentRuntime(store, { execute: async () => undefined });
  expect((await restarted.snapshot('r')).activeSkills).toEqual(['review']);
 });
});
