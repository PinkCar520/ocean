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
});
