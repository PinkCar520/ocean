import { GatewayCoreLifecycle } from './core-lifecycle';
import { PrismaRuntimeEventStore } from '../run/runtime-event-store';
import type { Prisma } from '@prisma/client';
import { AgentRuntime, MemoryRuntimeEventStore } from '@ocean/core';

function fixture() {
  const rows: Array<{ sequence: number; payload: unknown }> = [];
  const tx = {
    runtimeCoreEvent: {
      findMany: async () => [...rows].sort((a, b) => a.sequence - b.sequence),
      createMany: async ({ data }: { data: Array<{ sequence: number; payload: unknown }> }) => {
        for (const entry of data) {
          if (rows.some(row => row.sequence === entry.sequence)) throw new Error('Unique constraint');
          rows.push({ sequence: entry.sequence, payload: structuredClone(entry.payload) });
        }
        return { count: data.length };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, core: new GatewayCoreLifecycle(), events: new PrismaRuntimeEventStore(tx) };
}

describe('Gateway Worker shares the Agent Runtime state machine', () => {
 it('fences real model -> queued tool -> worker -> model -> completed phases', async () => {
  const { core, tx, events } = fixture();
  expect((await core.startModel(tx, 'run', 'session')).state).toBe('calling_model');
  expect((await core.queueTool(tx, 'run', { id: 'call', name: 'shell', input: { cmd: 'original' } })).state)
   .toBe('validating_tools');
  expect((await core.prepareToolExecution(tx, 'run', {
   id: 'call', name: 'shell', input: { cmd: 'approved replacement' },
  })).pendingTools.call).toBe('prepared');
  expect((await core.settleQueuedTool(tx, 'run', 'call', 'succeeded', { ok: true }, false)).state)
   .toBe('persisting_results');
  expect((await core.startModel(tx, 'run', 'session')).state).toBe('calling_model');
  expect((await core.finishModel(tx, 'run', true)).state).toBe('completed');
  expect((await events.read('run')).map(e => e.type)).toContain('tool.proposed');
  expect((await events.read('run')).map(e => e.type)).toContain('tool.prepared');
  expect((await events.read('run')).map(e => e.type)).toContain('tool.settled');
 });
 it('matches the inline CLI Agent Runtime event lifecycle for one model/tool continuation', async () => {
  const localStore = new MemoryRuntimeEventStore();
  let localEffects = 0;
  const local = new AgentRuntime(localStore, {
   execute: async () => { localEffects++; return { ok: true }; },
  });
  await local.create('local', 'session');
  await local.transition('local', 'preparing_context');
  await local.transition('local', 'calling_model');
  await local.transition('local', 'validating_tools');
  await local.proposeTools('local', [{ id: 'call', name: 'echo', input: {} }]);
  await local.transition('local', 'executing_tools');
  expect(await local.executeTool('local', 'call', 'echo', {}, 'local')).toEqual({ ok: true });
  await local.transition('local', 'persisting_results');
  await local.transition('local', 'preparing_context');
  await local.transition('local', 'calling_model');
  await local.verifyCompletion('local', ['CLI transcript verified']);
  expect((await local.transition('local', 'completed')).state).toBe('completed');

  const { core, tx, events } = fixture();
  await core.startModel(tx, 'gateway', 'session');
  await core.queueTool(tx, 'gateway', { id: 'call', name: 'echo', input: {} });
  await core.prepareToolExecution(tx, 'gateway', { id: 'call', name: 'echo', input: {} });
  await core.settleQueuedTool(tx, 'gateway', 'call', 'succeeded', { ok: true }, false);
  await core.startModel(tx, 'gateway', 'session');
  expect((await core.finishModel(tx, 'gateway', true)).state).toBe('completed');

  const localEvents = await localStore.read('local');
  const gatewayEvents = await events.read('gateway');
  expect(gatewayEvents.map(event => event.type)).toEqual(localEvents.map(event => event.type));
  expect(gatewayEvents.filter(event => event.type === 'tool.settled'))
   .toMatchObject([{ invocationId: 'call', outcome: 'succeeded', result: { ok: true } }]);
  expect(localEffects).toBe(1);
 });
 it('blocks model replay when queued work has not produced a persisted result', async () => {
  const { core, tx } = fixture();
  await core.startModel(tx, 'run', 'session');
  await core.queueTool(tx, 'run', { id: 'call', name: 'shell', input: {} });
  await expect(core.startModel(tx, 'run', 'session')).rejects.toThrow('has not executed');
  await core.prepareToolExecution(tx, 'run', { id: 'call', name: 'shell', input: {} });
  await expect(core.startModel(tx, 'run', 'session')).rejects.toThrow('journal reconciliation');
 });
 it('rejects recovery after a sibling tool settles but another proposed call was never claimed', async () => {
  const { core, tx, events } = fixture();
  await core.startModel(tx, 'partial-run', 'session');
  const proposed = await core.queueTool(tx, 'partial-run', { id: 'first', name: 'shell', input: {} });
  // Simulate a persisted two-call model batch. Gateway must not forget the
  // second proposed call merely because the first tool has completed.
  await events.append('partial-run', proposed.revision, [{
   type: 'tool.proposed', runId: 'partial-run', at: new Date().toISOString(),
   invocationId: 'second', toolName: 'shell',
   inputDigest: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  }]);
  await core.prepareToolExecution(tx, 'partial-run', { id: 'first', name: 'shell', input: {} });
  await core.settleQueuedTool(tx, 'partial-run', 'first', 'succeeded', { ok: true }, false);
  const before = await events.read('partial-run');
  await expect(core.startModel(tx, 'partial-run', 'session')).rejects.toThrow('has not executed');
  expect(await events.read('partial-run')).toEqual(before);
 });
 it('refuses a changed session identity on an already persisted Run', async () => {
  const { core, tx, events } = fixture();
  await core.startModel(tx, 'session-run', 'session-a');
  const before = await events.read('session-run');
  await expect(core.startModel(tx, 'session-run', 'session-b'))
   .rejects.toThrow('session identity mismatch');
  expect(await events.read('session-run')).toEqual(before);
 });

 it('blocks continuation after a settled but unknown external tool outcome', async () => {
  const { core, tx } = fixture();
  await core.startModel(tx, 'unknown-run', 'session');
  await core.queueTool(tx, 'unknown-run', { id: 'unknown-tool', name: 'shell', input: {} });
  await core.prepareToolExecution(tx, 'unknown-run', { id: 'unknown-tool', name: 'shell', input: {} });
  await core.settleQueuedTool(tx, 'unknown-run', 'unknown-tool', 'unknown', undefined, false);
  await expect(core.startModel(tx, 'unknown-run', 'session'))
   .rejects.toThrow('journal reconciliation');
 });

 it('rejects changed queued tool names before any execution claim', async () => {
  const { core, tx } = fixture();
  await core.startModel(tx, 'run', 'session');
  await core.queueTool(tx, 'run', { id: 'call', name: 'bash', input: {} });
  await expect(core.prepareToolExecution(tx, 'run', {
   id: 'call', name: 'file_write', input: {},
  })).rejects.toThrow('Queued tool name mismatch');
 });
});
