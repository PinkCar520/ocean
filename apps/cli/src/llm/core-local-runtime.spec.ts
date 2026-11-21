import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from '../utils/session-store.js';

vi.mock('./core-model-adapter.js', () => ({
  createAiSdkModelPort: () => ({ next: async () => ({ kind: 'complete', text: 'verified response' }) }),
}));
import { runOceanCoreLocal } from './core-local-runtime.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('local Ocean Core SDK integration', () => {
 it('runs a model-only session through durable events and existing SessionStore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-core-local-')); roots.push(root);
  const sessionStore = new SessionStore(join(root, 'sessions'));
  const session = await sessionStore.create(root);
  await sessionStore.save(session.id, root, [{ role: 'user', content: 'hello' }]);
  const result = await runOceanCoreLocal({
   sessionStore,
   sessionId: session.id,
   runId: 'run-1',
   workspace: root,
   model: {} as any,
   systemPrompt: 'test',
   tools: {},
   authorization: { evaluate: async () => 'deny' },
   completion: { verify: async () => ['host verified response'] },
   runtimeDirectory: join(root, 'runtime'),
  });
  expect(result.snapshot).toMatchObject({ state: 'completed', sessionId: session.id });
  expect((await sessionStore.load(session.id, root)).messages.at(-1)).toEqual({
   role: 'assistant', content: 'verified response',
  });
 });
});
