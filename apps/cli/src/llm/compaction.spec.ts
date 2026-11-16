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
    await expect(compactContext(history(), { model: {}, systemPrompt: '', budget: 5000, persist })).rejects.toThrow('Incomplete');
    expect(persist).not.toHaveBeenCalled();
    generate.mockResolvedValue({ text: JSON.stringify(summary) });
    await expect(compactContext(history(), { model: {}, systemPrompt: '', budget: 5000, persist: async () => { throw new Error('disk unavailable'); } })).rejects.toThrow('disk unavailable');
  });
});
