import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ModelMessage } from 'ai';
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('ai', async (original) => ({ ...await original<typeof import('ai')>(), generateText: generate }));
import { compactContext, contextTokens, type Compaction } from './compaction.js';
import { SessionStore } from '../utils/session-store.js';

const summary = { goal: 'Fix src/login.ts', constraints: ['No new dependencies'], fileChanges: ['src/login.ts'], failedTests: ['login rejects expired token'], completedTools: ['read login.ts'], pendingWork: ['Run login tests'] };
function history(): ModelMessage[] {
  return Array.from({ length: 12 }, (_, i) => [
    { role: 'user', content: `Fix login ${i} ${'x'.repeat(3000)}` },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: `call-${i}`, toolName: 'read', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: `call-${i}`, toolName: 'read', output: { type: 'text', value: 'source' } }] },
    { role: 'assistant', content: 'Next step' },
  ]).flat() as ModelMessage[];
}

describe('automatic context compaction', () => {
  it('keeps small contexts unchanged without invoking the model', async () => {
    generate.mockClear();
    const messages: ModelMessage[] = [{ role: 'user', content: 'hello' }];
    expect(await compactContext(messages, { model: {}, systemPrompt: '', persist: vi.fn() })).toBe(messages);
    expect(generate).not.toHaveBeenCalled();
  });

  it('reduces context, preserves tool pairs, persists and restores in a fresh process, then compacts again', async () => {
    generate.mockResolvedValue({ text: JSON.stringify(summary) });
    const root = await mkdtemp(join(tmpdir(), 'ocean-compact-'));
    try {
      const store = new SessionStore(join(root, 'sessions'));
      const session = await store.create(root);
      const messages = history();
      await store.save(session.id, root, messages);
      let snapshot: Compaction | undefined;
      const persist = async (value: Compaction) => { await store.saveCompaction(session.id, root, value); snapshot = value; };
      const context = await compactContext(messages, { model: {}, systemPrompt: '', budget: 5000, persist });
      expect(contextTokens(context)).toBeLessThan(contextTokens(messages));
      expect(context[0].content).toContain('No new dependencies');
      expect(context[0].content).toContain('login rejects expired token');
      expect(context.slice(1)).toEqual(messages.slice(snapshot!.covered));
      expect((context[1] as any).role).toBe('user');
      const script = `import {SessionStore} from './src/utils/session-store.ts'; const s=await new SessionStore(process.argv[1]).load(process.argv[2],process.argv[3]); console.log(JSON.stringify(s));`;
      const restored = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, join(root, 'sessions'), session.id, root], { encoding: 'utf8' }));
      expect(restored.messages).toEqual(messages);
      expect(restored.compaction).toEqual(snapshot);
      generate.mockClear();
      expect(await compactContext(messages, { model: {}, systemPrompt: '', previous: restored.compaction, persist })).toEqual(context);
      expect(generate).not.toHaveBeenCalled();
      const extended = [...messages, ...history()];
      // Use a unique later transcript; completed call ids remain untouched in the original history.
      await compactContext(extended, { model: {}, systemPrompt: '', previous: snapshot, budget: 5000, persist: async (value) => { snapshot = value; } });
      expect(snapshot!.covered).toBeGreaterThan(restored.compaction.covered);
      expect(generate.mock.calls[0][0].messages[0].content).toContain('No new dependencies');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not commit malformed summaries and propagates persistence failures', async () => {
    const persist = vi.fn();
    generate.mockResolvedValue({ text: '{}' });
    await expect(compactContext(history(), { model: {}, systemPrompt: '', budget: 5000, persist })).rejects.toThrow('Context compaction failed');
    expect(persist).not.toHaveBeenCalled();
    generate.mockResolvedValue({ text: JSON.stringify(summary) });
    await expect(compactContext(history(), { model: {}, systemPrompt: '', budget: 5000, persist: async () => { throw new Error('disk unavailable'); } })).rejects.toThrow('Context compaction failed');
  });
});

it('reserves model output and tool space from the configured context window', async () => {
 const { contextBudget } = await import('./compaction.js');
 expect(contextBudget({ contextWindow: 16000, outputReserve: 4000, toolReserve: 2000 })).toBe(10000);
 expect(() => contextBudget({ contextWindow: 4000, outputReserve: 4000 })).toThrow('budget');
});

it('stops repeated failed compaction requests for the same session scope', async () => {
 generate.mockClear(); generate.mockRejectedValue(new Error('upstream unavailable'));
 const options = { model: {}, systemPrompt: '', budget: 5000, scope: 'failure-test', persist: vi.fn() };
 await expect(compactContext(history(), options)).rejects.toThrow('Context compaction failed');
 await expect(compactContext(history(), options)).rejects.toThrow('Context compaction failed');
 await expect(compactContext(history(), options)).rejects.toThrow('failure limit');
 expect(generate).toHaveBeenCalledTimes(2);
 expect(options.persist).not.toHaveBeenCalled();
});

it('keeps an unresolved tool call on its original side of a compaction boundary', async () => {
 generate.mockClear();
 const messages = history();
 messages.splice(2, 1); // Remove the first call result: a later user boundary is unsafe.
 const persist = vi.fn();
 await expect(compactContext(messages, { model: {}, systemPrompt: '', budget: 5000, scope: 'unresolved-pair', persist }))
   .rejects.toThrow('no safe compaction boundary');
 expect(generate).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
});

it('compacts a tool-only step boundary without splitting a call/result pair', async () => {
  generate.mockClear();
  generate.mockResolvedValue({ text: JSON.stringify(summary) });
  const messages: ModelMessage[] = [{ role: 'user', content: 'Run the migration' }];
  for (let i = 0; i < 12; i += 1) {
    messages.push(
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: `step-${i}`, toolName: 'bash', input: { command: `step ${i}` } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: `step-${i}`, toolName: 'bash', output: { type: 'text', value: 'y'.repeat(3000) } }] },
    );
  }
  const result = await compactContext(messages, { model: {}, systemPrompt: '', budget: 5000, boundary: 'any', scope: 'tool-boundary', persist: vi.fn() });
  expect(contextTokens(result)).toBeLessThan(contextTokens(messages));
  expect(result[0].content).toContain('No new dependencies');
  expect(generate.mock.calls[0][0].messages[0].content).toContain('Run the migration');
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const message of result) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === 'tool-call') calls.add(part.toolCallId);
      if (part.type === 'tool-result') results.add(part.toolCallId);
    }
  }
  expect([...calls].every((id) => results.has(id))).toBe(true);
  expect([...results].every((id) => calls.has(id))).toBe(true);
});

it('trusts provider usage over the byte estimate when it fits the budget', async () => {
  generate.mockClear();
  const messages = history();
  const persist = vi.fn();
  const result = await compactContext(messages, { model: {}, systemPrompt: '', budget: 5000, usage: { totalTokens: 100, messageCount: messages.length }, persist });
  expect(result).toBe(messages);
  expect(generate).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
});

it('compacts when provider usage exceeds the budget even if bytes are below it', async () => {
  generate.mockClear();
  generate.mockResolvedValue({ text: JSON.stringify(summary) });
  const messages: ModelMessage[] = [
    { role: 'user', content: 'a'.repeat(300) },
    { role: 'assistant', content: 'b'.repeat(300) },
    { role: 'user', content: 'c'.repeat(300) },
    { role: 'assistant', content: 'd'.repeat(300) },
    { role: 'user', content: 'e'.repeat(300) },
    { role: 'assistant', content: 'f'.repeat(300) },
  ];
  const persist = vi.fn();
  await compactContext(messages, { model: {}, systemPrompt: '', budget: 5000, usage: { totalTokens: 6000, messageCount: messages.length }, scope: 'usage-over-budget', persist });
  expect(generate).toHaveBeenCalledOnce();
  expect(persist).toHaveBeenCalledOnce();
});

it('ignores a usage prefix that no longer fits the transcript', async () => {
  const { tokenCountWithEstimation } = await import('./compaction.js');
  const messages: ModelMessage[] = [{ role: 'user', content: 'short' }];
  expect(tokenCountWithEstimation(messages, { totalTokens: 10, messageCount: 2 })).toBe(contextTokens(messages));
  expect(tokenCountWithEstimation(messages, { totalTokens: 10, messageCount: 0 })).toBe(10 + contextTokens(messages));
});

it('adjusts provider usage across a persisted summary instead of ignoring it', async () => {
  generate.mockClear();
  generate.mockResolvedValue({ text: JSON.stringify(summary) });
  const messages = history();
  let snapshot: Compaction | undefined;
  await compactContext(messages, { model: {}, systemPrompt: '', budget: 5000, scope: 'usage-snapshot-1', persist: async (value) => { snapshot = value; } });
  expect(snapshot).toBeDefined();
  generate.mockClear();
  const result = await compactContext(messages, {
    model: {}, systemPrompt: '', budget: 5000, scope: 'usage-snapshot-2', previous: snapshot,
    usage: { totalTokens: 6000, messageCount: messages.length },
    persist: vi.fn(),
  });
  expect(result[0].content).toContain('No new dependencies');
  expect(generate).not.toHaveBeenCalled();
});


it('counts serialized context with the selected BPE tokenizer rather than byte division', async () => {
 const { countTextTokens } = await import('@ocean/core');
 const { contextTokens } = await import('./compaction.js');
 const messages = [{ role: 'user', content: '你好，世界。Hello world!' }] as any;
 expect(contextTokens(messages)).toBe(countTextTokens(JSON.stringify(messages)));
 expect(countTextTokens('hello world', 'cl100k_base')).toBe(2);
 expect(countTextTokens('')).toBe(0);
});

function compactRetryHistory(): ModelMessage[] {
  return Array.from({ length: 12 }, (_, i) => ({
    role: 'user' as const,
    content: `Turn ${i}: ${'alpha beta gamma delta '.repeat(25)}`,
  }));
}

it('retries an ineffective summary with a smaller token cap and persists only the effective result', async () => {
  generate.mockReset();
  const messages = compactRetryHistory();
  const verbose = { ...summary, goal: 'alpha beta gamma delta '.repeat(1000) };
  generate.mockResolvedValueOnce({ text: JSON.stringify(verbose) })
    .mockResolvedValueOnce({ text: JSON.stringify(summary) });
  const persist = vi.fn();
  const result = await compactContext(messages, {
    model: {}, systemPrompt: '', budget: 800,
    scope: 'ineffective-summary-retry', persist,
  });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[0][0].maxOutputTokens).toBe(2000);
  expect(generate.mock.calls[1][0].maxOutputTokens).toBe(700);
  expect(persist).toHaveBeenCalledTimes(1);
  expect(contextTokens(result)).toBeLessThan(contextTokens(messages));
});

it('never persists a summary that fails to reduce context after bounded retries', async () => {
  generate.mockReset();
  const messages = compactRetryHistory();
  const verbose = { ...summary, goal: 'alpha beta gamma delta '.repeat(1000) };
  generate.mockResolvedValue({ text: JSON.stringify(verbose) });
  const persist = vi.fn();
  await expect(compactContext(messages, {
    model: {}, systemPrompt: '', budget: 800,
    scope: 'ineffective-summary-exhausted', persist,
  })).rejects.toThrow('Context compaction failed');
  expect(generate).toHaveBeenCalledTimes(2);
  expect(persist).not.toHaveBeenCalled();
});

it('falls back to the original transcript only when it fits the local budget', async () => {
  generate.mockReset();
  generate.mockRejectedValue(new Error('summary provider unavailable'));
  const messages: ModelMessage[] = [{ role: 'user', content: 'small context' }];
  const persist = vi.fn();
  const result = await compactContext(messages, {
    model: {}, systemPrompt: '', budget: 5000,
    usage: { totalTokens: 6000, messageCount: messages.length },
    scope: 'safe-fallback', persist,
  });
  expect(result).toBe(messages);
  expect(persist).not.toHaveBeenCalled();
});

it('refuses oversized original context when summary generation fails', async () => {
  generate.mockReset();
  generate.mockRejectedValue(new Error('summary provider unavailable'));
  const persist = vi.fn();
  const { ContextCompactionError } = await import('./compaction.js');
  await expect(compactContext(history(), {
    model: {}, systemPrompt: '', budget: 5000,
    scope: 'unsafe-fallback', persist,
  })).rejects.toBeInstanceOf(ContextCompactionError);
  expect(persist).not.toHaveBeenCalled();
});

it('preserves a short unresolved tool call when provider usage alone triggers compaction', async () => {
  generate.mockClear();
  const messages: ModelMessage[] = [
    { role: 'user', content: 'run' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'pending', toolName: 'bash', input: {} }] },
  ];
  const persist = vi.fn();
  const result = await compactContext(messages, {
    model: {}, systemPrompt: '', budget: 5000,
    usage: { totalTokens: 6000, messageCount: messages.length },
    scope: 'safe-unresolved-pair', persist,
  });
  expect(result).toBe(messages);
  expect(generate).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
});

it('microcompacts stale tool results before invoking the summary model', async () => {
  generate.mockClear();
  const messages: ModelMessage[] = [{ role: 'user', content: 'inspect logs' }];
  for (let i = 0; i < 5; i++) {
    messages.push(
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: `micro-${i}`, toolName: 'bash', input: { command: `log ${i}` } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: `micro-${i}`, toolName: 'bash', output: { type: 'text', value: 'x'.repeat(3000) } }] },
    );
  }
  const original = JSON.stringify(messages);
  const persist = vi.fn();
  const result = await compactContext(messages, {
    model: {}, systemPrompt: '', budget: 1500, scope: 'microcompact-before-summary', persist,
  });
  expect(result).not.toBe(messages);
  expect(contextTokens(result)).toBeLessThan(1500);
  expect(JSON.stringify(messages)).toBe(original);
  expect(generate).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
});
