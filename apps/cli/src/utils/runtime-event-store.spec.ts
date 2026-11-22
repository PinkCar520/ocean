import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRuntimeEventStore } from './runtime-event-store.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('local host runtime event persistence', () => {
 it('replays a run after creating a new store instance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-runtime-')); roots.push(root);
  const store = new FileRuntimeEventStore(root);
  const event = { type: 'run.created' as const, runId: 'run', at: new Date().toISOString(), sessionId: 'session', schemaVersion: 1 as const };
  expect(await store.append('run', 0, [event])).toBe(1);
  expect(await new FileRuntimeEventStore(root).read('run')).toEqual([event]);
  await expect(store.append('run', 0, [event])).rejects.toThrow('revision conflict');
 });
 it('refuses symlinked journal paths without following them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-runtime-')); roots.push(root);
  const store = new FileRuntimeEventStore(root);
  const outside = join(root, 'outside.json');
  const { writeFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  await writeFile(outside, JSON.stringify([{ type: 'run.created', runId: 'run', at: new Date().toISOString() }]));
  const journal = join(root, `runtime-${createHash('sha256').update('run').digest('hex')}.json`);
  await symlink(outside, journal);
  await expect(store.read('run')).rejects.toThrow('Unsafe runtime event file');
 });
 it('rejects malformed streams without replacing persisted events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-runtime-')); roots.push(root);
  const store = new FileRuntimeEventStore(root);
  const created = { type: 'run.created' as const, runId: 'run', at: new Date().toISOString() };
  await store.append('run', 0, [created]);
  await expect(store.append('run', 1, [{
   type: 'run.transitioned', runId: 'run', at: created.at, from: 'created', to: 'completed',
  }])).rejects.toThrow('Invalid runtime transition');
  expect(await store.read('run')).toEqual([created]);
 });
 it('rejects a concurrent claim instead of racing the journal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-runtime-')); roots.push(root);
  const store = new FileRuntimeEventStore(root);
  const created = { type: 'run.created' as const, runId: 'run', at: new Date().toISOString() };
  await store.append('run', 0, [created]);
  const { createHash } = await import('node:crypto');
  const { open } = await import('node:fs/promises');
  const file = join(root, `runtime-${createHash('sha256').update('run').digest('hex')}.json.lock`);
  const lock = await open(file, 'wx', 0o600);
  try {
   await expect(store.append('run', 1, [{
    type: 'run.transitioned', runId: 'run', at: created.at, from: 'created', to: 'preparing_context',
   }])).rejects.toMatchObject({ code: 'EEXIST' });
  } finally { await lock.close(); }
 });

});
