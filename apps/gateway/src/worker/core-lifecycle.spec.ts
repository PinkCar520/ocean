import { GatewayCoreLifecycle } from './core-lifecycle';
import { PrismaRuntimeEventStore } from '../run/runtime-event-store';
import type { Prisma } from '@prisma/client';

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
 it('blocks model replay when queued work has not produced a persisted result', async () => {
  const { core, tx } = fixture();
  await core.startModel(tx, 'run', 'session');
  await core.queueTool(tx, 'run', { id: 'call', name: 'shell', input: {} });
  await expect(core.startModel(tx, 'run', 'session')).rejects.toThrow('has not executed');
  await core.prepareToolExecution(tx, 'run', { id: 'call', name: 'shell', input: {} });
  await expect(core.startModel(tx, 'run', 'session')).rejects.toThrow('journal reconciliation');
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
