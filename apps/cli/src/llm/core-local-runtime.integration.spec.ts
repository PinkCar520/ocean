import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SessionStore } from '../utils/session-store.js';
import { FileRuntimeEventStore } from '../utils/runtime-event-store.js';
import { replayRuntime } from '@ocean/core';

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

describe('CLI Core interrupted-run recovery', () => {
 it('recovers a completed side effect after transcript persistence failure without re-executing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-local-recovery-')); roots.push(root);
  const sessions = new SessionStore(join(root, 'sessions'));
  const session = await sessions.create(root);
  await sessions.save(session.id, root, [{ role: 'user', content: 'perform exactly once' }]);
  next.mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'once-1', name: 'echo', input: { message: 'once' } }],
  }).mockResolvedValueOnce({ kind: 'complete', text: 'recovered' });
  const execute = vi.fn(async (input: { message: string }) => ({ text: input.message }));
  const append = vi.spyOn(sessions, 'appendMessages').mockImplementationOnce(async () => {
   throw new Error('simulated crash after durable tool journal and Core result');
  });
  const options = {
   sessionStore: sessions, sessionId: session.id, runId: 'recovery-run',
   workspace: root, runtimeDirectory: join(root, 'events'),
   model: {} as any, systemPrompt: 'test',
   tools: { echo: { inputSchema: z.object({ message: z.string() }), execute } },
   authorization: { evaluate: async () => 'allow' as const },
   completion: { verify: async () => ['host validated'] },
  };
  await expect(runOceanCoreLocal(options)).rejects.toThrow('simulated crash');
  append.mockRestore();
  expect(execute).toHaveBeenCalledOnce();
  const runtimeEvents = new FileRuntimeEventStore(join(root, 'events'));
  expect(replayRuntime('recovery-run', await runtimeEvents.read('recovery-run')).state).toBe('interrupted');
  const recovered = await runOceanCoreLocal({ ...options, resume: true });
  expect(recovered.snapshot.state).toBe('completed');
  expect(execute).toHaveBeenCalledOnce();
  const persisted = await sessions.loadPersisted(session.id, root);
  expect(persisted.messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  expect((await runtimeEvents.read('recovery-run')).filter(e => e.type === 'tool.prepared')).toHaveLength(1);
  expect((await runtimeEvents.read('recovery-run')).filter(e => e.type === 'tool.settled')).toHaveLength(1);
 });
 it('refuses to retry an unknown outcome even if the model produces another tool call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-local-unknown-')); roots.push(root);
  const sessions = new SessionStore(join(root, 'sessions'));
  const session = await sessions.create(root);
  await sessions.save(session.id, root, [{ role: 'user', content: 'perform exactly once' }]);
  next.mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'unsafe-1', name: 'echo', input: { message: 'maybe' } }],
  }).mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'unsafe-2', name: 'echo', input: { message: 'retry' } }],
  });
  const execute = vi.fn(async () => { throw new Error('connection lost after effect'); });
  const options = {
   sessionStore: sessions, sessionId: session.id, runId: 'unknown-run',
   workspace: root, runtimeDirectory: join(root, 'events'),
   model: {} as any, systemPrompt: 'test',
   tools: { echo: { inputSchema: z.object({ message: z.string() }), execute } },
   authorization: { evaluate: async () => 'allow' as const },
   completion: { verify: async () => ['host validated'] },
  };
  await expect(runOceanCoreLocal(options)).rejects.toThrow('outcome unknown');
  await expect(runOceanCoreLocal({ ...options, resume: true })).rejects.toThrow('Unresolved tool effects');
  expect(execute).toHaveBeenCalledOnce();
  expect(next).toHaveBeenCalledOnce();
 });
});

describe('CLI model decision fidelity', () => {
 it('preserves model commentary and all tool/result pairs across a multi-tool decision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-batch-transcript-')); roots.push(root);
  const sessions = new SessionStore(join(root, 'sessions'));
  const session = await sessions.create(root);
  await sessions.save(session.id, root, [{ role: 'user', content: 'read two files' }]);
  next.mockResolvedValueOnce({ kind: 'tools', text: 'Inspecting both files.',
   calls: [
    { id: 'read-a', name: 'read', input: { file: 'a.txt' } },
    { id: 'read-b', name: 'read', input: { file: 'b.txt' } },
   ],
  }).mockResolvedValueOnce({ kind: 'complete', text: 'Both files inspected.' });
  const execute = vi.fn(async ({ file }: { file: string }) => ({ file }));
  const result = await runOceanCoreLocal({
   sessionStore: sessions, sessionId: session.id, runId: 'batch-run',
   workspace: root, runtimeDirectory: join(root, 'events'),
   model: {} as any, systemPrompt: 'test',
   tools: { read: { inputSchema: z.object({ file: z.string() }), execute } },
   authorization: { evaluate: async () => 'allow' },
   completion: { verify: async () => ['verified'] },
  });
  expect(result.snapshot.state).toBe('completed');
  expect(execute).toHaveBeenCalledTimes(2);
  const persisted = await sessions.loadPersisted(session.id, root);
  expect(persisted.messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant']);
  expect(persisted.messages[1].content).toEqual([
   { type: 'text', text: 'Inspecting both files.' },
   { type: 'tool-call', toolCallId: 'read-a', toolName: 'read', input: { file: 'a.txt' } },
  ]);
  const events = await new FileRuntimeEventStore(join(root, 'events')).read('batch-run');
  expect(events.filter(e => e.type === 'tool.proposed')).toHaveLength(2);
  expect(events.filter(e => e.type === 'tool.settled')).toHaveLength(2);
 });
 it('persists the same bounded output to journal and Core events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-large-output-')); roots.push(root);
  const sessions = new SessionStore(join(root, 'sessions'));
  const session = await sessions.create(root);
  await sessions.save(session.id, root, [{ role: 'user', content: 'large output' }]);
  next.mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'huge-1', name: 'read', input: {} }],
  }).mockResolvedValueOnce({ kind: 'complete', text: 'done' });
  const execute = vi.fn(async () => ({ body: 'a'.repeat(1024 * 1024 + 100) }));
  await runOceanCoreLocal({
   sessionStore: sessions, sessionId: session.id, runId: 'huge-run',
   workspace: root, runtimeDirectory: join(root, 'events'),
   model: {} as any, systemPrompt: 'test',
   tools: { read: { inputSchema: z.object({}), execute } },
   authorization: { evaluate: async () => 'allow' },
   completion: { verify: async () => ['verified'] },
  });
  expect(execute).toHaveBeenCalledOnce();
  const journal = await sessions.readToolCallJournal(session.id, root, 'huge-1');
  const settled = (await new FileRuntimeEventStore(join(root, 'events')).read('huge-run'))
   .find(e => e.type === 'tool.settled' && e.invocationId === 'huge-1');
  expect(journal?.output).toEqual({ truncated: true, error: 'Tool output exceeded 1 MiB limit' });
  expect(settled?.type === 'tool.settled' && settled.result).toEqual(journal?.output);
 });
});

describe('CLI Skill activation and Session restoration', () => {
 it('applies activated Skill tool restrictions immediately and after a new Run restores the Session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-skill-recovery-')); roots.push(root);
  const sessions = new SessionStore(join(root, 'sessions'));
  const session = await sessions.create(root);
  await sessions.save(session.id, root, [{ role: 'user', content: 'use review skill' }]);
  const skill = {
   manifest: { name: 'review', description: 'Review code', 'allowed-tools': ['file_read'] },
   sourcePath: join(root, '.ocean', 'skills', 'review'),
   source: 'project' as const,
   content: 'Review instructions',
  };
  const executeRead = vi.fn(async () => ({ file: 'x' }));
  const tools = {
   activate_skill: { inputSchema: z.object({ skill_name: z.string() }),
    execute: async () => ({ skill: 'review', sourcePath: skill.sourcePath, instructions: 'Review instructions' }) },
   shell: { inputSchema: z.object({ command: z.string() }), execute: executeRead },
  };
  const options = {
   sessionStore: sessions, sessionId: session.id, runId: 'activate-run',
   workspace: root, runtimeDirectory: join(root, 'events'),
   model: {} as any, systemPrompt: 'test', tools, skills: [skill],
   authorization: { evaluate: async () => 'allow' as const },
   completion: { verify: async () => ['verified'] },
  };
  next.mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'activate-1', name: 'activate_skill', input: { skill_name: 'review' } }],
  }).mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'denied-1', name: 'shell', input: { command: 'unsafe' } }],
  });
  await expect(runOceanCoreLocal(options)).rejects.toThrow('denied by policy');
  expect(executeRead).not.toHaveBeenCalled();
  const runtime = new FileRuntimeEventStore(join(root, 'events'));
  const state = replayRuntime('activate-run', await runtime.read('activate-run'));
  expect(state.skillToolConstraints.review).toEqual(['file_read']);
  const transcript = await sessions.loadPersisted(session.id, root);
  expect(transcript.messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool']);
  next.mockResolvedValueOnce({
   kind: 'tools', calls: [{ id: 'denied-2', name: 'shell', input: { command: 'unsafe again' } }],
  });
  await expect(runOceanCoreLocal({ ...options, runId: 'restored-run' }))
   .rejects.toThrow('denied by policy');
  expect(executeRead).not.toHaveBeenCalled();
  const restored = replayRuntime('restored-run', await runtime.read('restored-run'));
  expect(restored.activeSkills).toEqual(['review']);
  expect(restored.skillToolConstraints.review).toEqual(['file_read']);
 });
});
