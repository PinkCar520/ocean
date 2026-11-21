import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SessionStore } from '../utils/session-store.js';
import { FileRuntimeEventStore } from '../utils/runtime-event-store.js';

const next = vi.hoisted(() => vi.fn());
vi.mock('./core-model-adapter.js', () => ({
  createAiSdkModelPort: () => ({ next }),
}));
import { runOceanCoreLocal } from './core-local-runtime.js';

const roots: string[] = [];
beforeEach(() => next.mockReset());
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('CLI shared Agent Core execution and side effects', () => {
 it('passes real local tools through pre/post hooks, durable journal and transcript pairs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-local-agent-')); roots.push(root);
  const sessions = new SessionStore(join(root, 'sessions'));
  const session = await sessions.create(root);
  await sessions.save(session.id, root, [{ role: 'user', content: 'echo hi' }]);
  next.mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'echo-1', name: 'echo', input: { message: 'hi' } }],
  }).mockResolvedValueOnce({ kind: 'complete', text: 'done' });
  const execute = vi.fn(async (input: { message: string }) => ({ text: input.message }));
  const before = vi.fn(async () => undefined);
  const after = vi.fn(async (_name: string, _input: unknown, _id: string, output: unknown) => output);
  const result = await runOceanCoreLocal({
   sessionStore: sessions, sessionId: session.id, runId: 'core-run', workspace: root,
   runtimeDirectory: join(root, 'events'),
   model: {} as any, systemPrompt: 'test',
   tools: { echo: { inputSchema: z.object({ message: z.string() }), execute } },
   authorization: { evaluate: async () => 'allow' },
   completion: { verify: async () => ['host validated'] },
   beforeToolUse: before, afterToolUse: after,
  });
  expect(result.snapshot.state).toBe('completed');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(before).toHaveBeenCalledOnce();
  expect(after).toHaveBeenCalledOnce();
  const persisted = await sessions.load(session.id, root);
  expect(persisted.messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  expect((await readdir(join(root, 'sessions'))).some(name => name.startsWith('journal-'))).toBe(true);
  const events = await new FileRuntimeEventStore(join(root, 'events')).read('core-run');
  expect(events.some(e => e.type === 'tool.prepared' && e.invocation.id === 'echo-1')).toBe(true);
  expect(events.some(e => e.type === 'tool.settled' && e.invocationId === 'echo-1')).toBe(true);
 });
});
