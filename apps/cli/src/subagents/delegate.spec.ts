import { describe, it, expect, vi } from 'vitest';
import { createDelegationTool } from './delegate.js';
describe('subagent delegation', () => {
  it('uses independent context and a read-only subset of parent tools', async () => {
    const run = vi.fn().mockResolvedValue({ text: 'found bug', responseMessages: [] });
    const tool = createDelegationTool([{ name: 'review', description: 'Review', prompt: 'Find bugs', tools: ['file_read', 'bash'], maxSteps: 4 }], { model: {}, tools: { file_read: {}, bash: {} }, systemPrompt: 'parent policy', run });
    expect(await tool.execute({ agent: 'review', task: 'review a.ts' }, { toolCallId: 'call-1' })).toMatchObject({ result: 'found bug' });
    expect(run.mock.calls[0][0]).toEqual([{ role: 'user', content: 'review a.ts' }]);
    expect(Object.keys(run.mock.calls[0][1].tools)).toEqual(['file_read']);
    expect(run.mock.calls[0][1].maxSteps).toBe(4);
  });
});

it('deduplicates a call id, rejects changed inputs and propagates cancellation', async () => {
  const controller = new AbortController();
  const run = vi.fn().mockImplementation(async (_messages, options) => {
    expect(options.signal).toBeDefined();
    controller.abort(new Error('parent cancelled'));
    options.signal.throwIfAborted();
  });
  const tool = createDelegationTool([{ name: 'review', description: 'Review', prompt: '', tools: [], maxSteps: 1 }], { model: {}, tools: {}, systemPrompt: '', signal: controller.signal, run });
  await expect(tool.execute({ agent: 'review', task: 'review' }, { toolCallId: 'a' })).rejects.toThrow('parent cancelled');
  expect(run).toHaveBeenCalledOnce();
});

it('returns the same completed result for duplicate delivery and denies nested tools', async () => {
  const run = vi.fn().mockResolvedValue({ text: 'result' });
  const tool = createDelegationTool([{ name: 'review', description: '', prompt: '', tools: ['delegate_task', 'file_write'], maxSteps: 1 }], { model: {}, tools: { delegate_task: {}, file_write: {} }, systemPrompt: '', run });
  const input = { agent: 'review', task: 'review' };
  expect(await tool.execute(input, { toolCallId: 'same' })).toEqual(await tool.execute(input, { toolCallId: 'same' }));
  expect(run).toHaveBeenCalledOnce();
  expect(run.mock.calls[0][1].tools).toEqual({});
  await expect(tool.execute({ ...input, task: 'different' }, { toolCallId: 'same' })).rejects.toThrow('different input');
});

it('reuses persisted parent tool results without running the child again', async () => {
  const run = vi.fn();
  const tool = createDelegationTool([], { model: {}, tools: {}, systemPrompt: '', run, history: [{ role: 'tool', content: [{ type: 'tool-result', toolName: 'delegate_task', toolCallId: 'done', output: { type: 'json', value: { taskId: 'done', result: 'persisted' } } }] }] });
  expect(await tool.execute({ agent: 'review', task: 'review' }, { toolCallId: 'done' })).toEqual({ taskId: 'done', result: 'persisted' });
  expect(run).not.toHaveBeenCalled();
});

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSubagents } from './delegate.js';
it('loads user/project markdown definitions with project precedence and bounded turns', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-agents-'));
  try {
    for (const base of ['home', 'project']) {
      const dir = join(root, base, '.ocean/agents');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'review.md'), `---\nname: review\ndescription: Review source\ntools: file_read, bash\nmaxTurns: 2\n---\n${base}`);
    }
    const definitions = loadSubagents(join(root, 'project'), join(root, 'home'));
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({ prompt: 'project', maxSteps: 2 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('bounds total child invocations and concurrent execution', async () => {
  let finish!: (value: any) => void;
  const run = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ text: 'done' });
  const tool = createDelegationTool([{ name: 'review', description: '', prompt: '', tools: [], maxSteps: 1 }], { model: {}, tools: {}, systemPrompt: '', run });
  const input = { agent: 'review', task: 'review' };
  const first = tool.execute(input, { toolCallId: '1' });
  await expect(tool.execute(input, { toolCallId: '2' })).rejects.toThrow('concurrency');
  finish({ text: 'done' });
  await first;
  for (const id of ['2', '3', '4']) await tool.execute(input, { toolCallId: id });
  await expect(tool.execute(input, { toolCallId: '5' })).rejects.toThrow('budget');
  expect(run).toHaveBeenCalledTimes(4);
});

import { SessionStore } from '../utils/session-store.js';
it('persists child identity and returns completed results after recreating the delegation tool', async () => {
 const root = await mkdtemp(join(tmpdir(), 'ocean-child-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  const run = vi.fn().mockResolvedValue({ text: 'done' });
  const definition = [{ name: 'review', description: '', prompt: '', tools: [], maxSteps: 1 }];
  const parent = { model: {}, tools: {}, systemPrompt: '', run, persistence: { store, sessionId: session.id, workspace: root } };
  const input = { agent: 'review', task: 'inspect' };
  await createDelegationTool(definition, parent).execute(input, { toolCallId: 'child' });
  await createDelegationTool(definition, parent).execute(input, { toolCallId: 'child' });
  expect(run).toHaveBeenCalledOnce();
  const children = (await store.list(root)).filter(s => s.subagent);
  expect(children).toHaveLength(1);
  expect(children[0].subagent).toMatchObject({ parentSessionId: session.id, status: 'succeeded', toolCallId: 'child' });
 } finally { await rm(root, { recursive: true, force: true }); }
});
