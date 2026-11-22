import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from './session-store.js';
import { SessionTranscriptPort } from './agent-transcript-port.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('CLI SessionStore Agent Core adapter', () => {
 it('loads and appends transcript messages with revision checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-agent-session-')); roots.push(root);
  const store = new SessionStore(join(root, 'sessions'));
  const workspace = root;
  const session = await store.create(workspace);
  const adapter = new SessionTranscriptPort(store, workspace);
  expect(await adapter.load(session.id)).toEqual([]);
  await adapter.append(session.id, 0, [{ role: 'user', content: 'hello' }]);
  expect(await adapter.load(session.id)).toEqual([{ role: 'user', content: 'hello' }]);
  await expect(adapter.append(session.id, 0, [{ role: 'assistant', content: 'bad' }]))
   .rejects.toThrow('revision conflict');
 });
 it('allows exactly one competing append and does not silently drop messages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-agent-session-')); roots.push(root);
  const store = new SessionStore(join(root, 'sessions'));
  const session = await store.create(root);
  const adapter = new SessionTranscriptPort(store, root);
  await adapter.append(session.id, 0, [{ role: 'user', content: 'start' }]);
  const results = await Promise.allSettled([
   adapter.append(session.id, 1, [{ role: 'assistant', content: 'writer A' }]),
   adapter.append(session.id, 1, [{ role: 'assistant', content: 'writer B' }]),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(await adapter.load(session.id)).toHaveLength(2);
 });

});
