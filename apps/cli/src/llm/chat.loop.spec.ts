import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamTextMock, stepCountIsMock, generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  streamTextMock: vi.fn(),
  stepCountIsMock: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: streamTextMock,
  generateText: generateTextMock,
  stepCountIs: stepCountIsMock,
}));

import { activeSkillInstructions, runChatLoop } from './chat.js';
import { historyDigest } from './compaction.js';

describe('CLI Agent loop transcript', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    stepCountIsMock.mockReturnValue('step-limit');
  });

  it('rejects an already cancelled turn before contacting the model', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: {}, signal: controller.signal })).rejects.toThrow();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it('blocks a late tool execution after cancellation', async () => {
    const controller = new AbortController();
    const execute = vi.fn();
    streamTextMock.mockImplementation(async (options) => {
      controller.abort();
      await expect(options.tools.read.execute({})).rejects.toThrow();
      return { text: Promise.resolve('late'), responseMessages: [] };
    });
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: { read: { execute } }, signal: controller.signal })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid step limit %s', async (maxSteps) => {
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: {}, maxSteps })).rejects.toThrow();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it('returns complete assistant/tool response messages for the next turn', async () => {
    const responseMessages = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'file_read', input: { path: 'a.ts' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'file_read', output: { content: 'source' } }] },
      { role: 'assistant', content: [{ type: 'text', text: 'I read the file.' }] },
    ];
    streamTextMock.mockResolvedValue({
      text: Promise.resolve('I read the file.'),
      responseMessages,
    });

    const result = await runChatLoop([], {
      model: {},
      systemPrompt: 'prompt',
      tools: {},
    });

    expect(result.text).toBe('I read the file.');
    expect(result.responseMessages).toEqual(responseMessages);
    expect(stepCountIsMock).toHaveBeenCalledWith(30);
  });

  it('rejects an interrupted stream instead of returning a completed turn', async () => {
    streamTextMock.mockResolvedValue({ text: Promise.resolve('partial'), finishReason: Promise.resolve('error'), responseMessages: [] });
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: {} })).rejects.toThrow('incomplete');
  });

  it('automatically compacts before continuing the model with executable tools', async () => {
    generateTextMock.mockResolvedValue({ text: JSON.stringify({ goal: 'fix login', constraints: ['no dependencies'], fileChanges: [], failedTests: ['login'], completedTools: [], pendingWork: ['test'] }) });
    const messages = Array.from({ length: 12 }, (_, i) => ({ role: 'user' as const, content: `${i}: ${'x'.repeat(5000)}` }));
    expect((await import('./compaction.js')).contextTokens(messages)).toBeGreaterThan(5000);
    const persist = vi.fn();
    const execute = vi.fn().mockResolvedValue('tests passed');
    streamTextMock.mockImplementation(async (options) => {
      expect(persist).toHaveBeenCalledOnce();
      expect(JSON.stringify(options.messages).length).toBeLessThan(JSON.stringify(messages).length);
      expect(options.messages[0].content).toContain('no dependencies');
      await options.tools.test.execute({});
      return { text: 'done', responseMessages: [{ role: 'assistant', content: 'done' }] };
    });
    const result = await runChatLoop(messages, { model: {}, systemPrompt: '', tools: { test: { execute } }, compaction: { budget: 5000, persist } });
    expect(execute).toHaveBeenCalledOnce();
    expect(result.text).toBe('done');
    expect(messages).toHaveLength(12);
  });

  it('runs prompt, pre and post hooks around execution', async () => {
    const run = vi.fn().mockResolvedValue({ blocked: false, reason: '' });
    const execute = vi.fn().mockResolvedValue('result');
    streamTextMock.mockImplementation(async (options) => {
      await options.tools.read.execute({ path: 'x' });
      return { text: 'done', responseMessages: [] };
    });
    await runChatLoop([{ role: 'user', content: 'read' }], { model: {}, systemPrompt: '', tools: { read: { execute } }, hooks: { run } as any });
    expect(run.mock.calls.map((call) => call[0])).toEqual(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']);
    expect(run.mock.calls[2][1].tool_response).toBe('result');
  });

  it('cannot bypass mandatory denial and pre hooks can prevent execution', async () => {
    const execute = vi.fn();
    const run = vi.fn().mockImplementation(async (event) => ({ blocked: event === 'PreToolUse', reason: 'denied' }));
    streamTextMock.mockImplementation(async (options) => {
      await options.tools.read.execute({});
      return { text: 'done', responseMessages: [] };
    });
    await runChatLoop([], { model: {}, systemPrompt: '', tools: { read: { execute } }, hooks: { run } as any });
    expect(execute).not.toHaveBeenCalled();
    run.mockClear();
    await runChatLoop([], { model: {}, systemPrompt: '', tools: { read: { execute, beforeApproval: async () => ({ error: 'policy denied' }) } }, hooks: { run } as any });
    expect(execute).not.toHaveBeenCalled();
    expect(run.mock.calls.map((call) => call[0])).not.toContain('PreToolUse');
  });

  it('continues after Stop blocks once and bounds repeated Stop rejection', async () => {
    const run = vi.fn().mockImplementation(async (event) => ({ blocked: event === 'Stop', reason: 'finish tests' }));
    streamTextMock.mockResolvedValue({ text: 'done', responseMessages: [] });
    await expect(runChatLoop([], { model: {}, systemPrompt: '', tools: {}, hooks: { run } as any })).rejects.toThrow('continuation limit');
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.filter((call) => call[0] === 'UserPromptSubmit')).toHaveLength(1);
    expect(run.mock.calls.filter((call) => call[0] === 'Stop').map((call) => call[1].stop_hook_active)).toEqual([false, true]);
  });

  it('activates explicit skills and returns guidance for session persistence', async () => {
    const execute = vi.fn().mockResolvedValue({ skill: 'review', instructions: 'Check security', sourcePath: '/skills/review' });
    streamTextMock.mockResolvedValue({ text: 'done', responseMessages: [] });
    const result = await runChatLoop([{ role: 'user', content: '/review this diff' }], { model: {}, systemPrompt: '', tools: { activate_skill: { execute } } });
    expect(execute).toHaveBeenCalledWith({ skill_name: 'review' }, { abortSignal: undefined });
    expect(result.responseMessages[0].content).toContain('Check security');
    expect(activeSkillInstructions(JSON.parse(JSON.stringify(result.responseMessages)))).toContain('Check security');
  });

  it('recovers model-selected skill instructions independently of compacted history', () => {
    const transcript = [{ role: 'tool', content: [{ type: 'tool-result', toolName: 'activate_skill', toolCallId: 'skill-1', output: { type: 'json', value: { skill: 'review', instructions: 'Check security', sourcePath: '/skills/review' } } }] }] as any;
    expect(activeSkillInstructions(JSON.parse(JSON.stringify(transcript)))).toContain('Check security');
  });

  it('delegates through the actual loop, calls a restricted child tool and returns to the parent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-delegate-loop-'));
    try {
      await mkdir(join(root, '.ocean/agents'), { recursive: true });
      await writeFile(join(root, '.ocean/agents/review.md'), '---\nname: review\ndescription: Review code\ntools: file_read, bash\nmaxTurns: 2\n---\nFind the failing assertion.');
      const read = vi.fn().mockResolvedValue('expected 200, received 401');
      const write = vi.fn();
      streamTextMock.mockImplementation(async (options) => {
        if (options.tools.delegate_task) {
          const child = await options.tools.delegate_task.execute({ agent: 'review', task: 'Find why login test fails' }, { toolCallId: 'child-1' });
          expect(child.result).toBe('Expired token causes 401');
          return { text: 'Parent will repair token setup', responseMessages: [{ role: 'assistant', content: 'Parent will repair token setup' }] };
        }
        expect(options.messages).toEqual([{ role: 'user', content: 'Find why login test fails' }]);
        expect(options.tools.bash).toBeUndefined();
        await options.tools.file_read.execute({ path: 'login.spec.ts' });
        return { text: 'Expired token causes 401', responseMessages: [] };
      });
      const result = await runChatLoop([{ role: 'user', content: 'Private parent conversation' }], { model: {}, systemPrompt: 'Policy', tools: { file_read: { execute: read }, bash: { execute: write } }, delegation: { workspace: root } });
      expect(result.text).toBe('Parent will repair token setup');
      expect(read).toHaveBeenCalledOnce();
      expect(write).not.toHaveBeenCalled();
      expect(streamTextMock).toHaveBeenCalledTimes(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('compacts between tool steps before the next model request', async () => {
    generateTextMock.mockResolvedValue({ text: JSON.stringify({ goal: 'migrate', constraints: ['keep pairing'], fileChanges: [], failedTests: [], completedTools: [], pendingWork: [] }) });
    const persist = vi.fn();
    const messages = [{ role: 'user' as const, content: 'migrate the schema' }];
    const midTurn: any[] = [...messages];
    for (let i = 0; i < 12; i += 1) {
      midTurn.push(
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: `call-${i}`, toolName: 'bash', input: { command: `step ${i}` } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: `call-${i}`, toolName: 'bash', output: { type: 'text', value: 'z'.repeat(3000) } }] },
      );
    }
    streamTextMock.mockImplementation(async (options) => {
      expect(typeof options.prepareStep).toBe('function');
      const next = await options.prepareStep({ stepNumber: 1, messages: midTurn });
      expect(next?.messages.length).toBeLessThan(midTurn.length);
      expect(JSON.stringify(next.messages)).toContain('keep pairing');
      const snapshot = persist.mock.calls[0][0];
      expect(snapshot.digest).toBe(historyDigest(midTurn.slice(0, snapshot.covered)));
      await options.prepareStep({ stepNumber: 2, messages: [...next.messages, { role: 'assistant', content: 'more' }] });
      expect(generateTextMock).toHaveBeenCalledOnce();
      expect(persist).toHaveBeenCalledOnce();
      return { text: 'done', responseMessages: [{ role: 'assistant', content: 'done' }] };
    });
    const result = await runChatLoop(messages, { model: {}, systemPrompt: '', tools: {}, compaction: { budget: 5000, persist } });
    expect(result.text).toBe('done');
    expect(generateTextMock).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0][0].covered).toBeGreaterThan(0);
  });

  it('skips the first step and leaves small mid-turn contexts untouched', async () => {
    const persist = vi.fn();
    streamTextMock.mockImplementation(async (options) => {
      expect(await options.prepareStep({ stepNumber: 0, messages: [{ role: 'user', content: 'small' }] })).toBeUndefined();
      expect(await options.prepareStep({ stepNumber: 1, messages: [{ role: 'user', content: 'small' }] })).toBeUndefined();
      return { text: 'done', responseMessages: [] };
    });
    await runChatLoop([{ role: 'user', content: 'small' }], { model: {}, systemPrompt: '', tools: {}, compaction: { budget: 5000, persist } });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('does not compact after cancellation and fails closed if the mid-turn summary fails', async () => {
    const persist = vi.fn();
    const big: any[] = [{ role: 'user', content: 'go' }];
    for (let i = 0; i < 12; i += 1) {
      big.push(
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: `cancel-${i}`, toolName: 'bash', input: { command: `step ${i}` } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: `cancel-${i}`, toolName: 'bash', output: { type: 'text', value: 'q'.repeat(3000) } }] },
      );
    }
    const controller = new AbortController();
    streamTextMock.mockImplementation(async (options) => {
      controller.abort();
      await expect(options.prepareStep({ stepNumber: 1, messages: big })).rejects.toThrow();
      return { text: 'done', responseMessages: [] };
    });
    await expect(runChatLoop([{ role: 'user', content: 'go' }], { model: {}, systemPrompt: '', tools: {}, signal: controller.signal, compaction: { budget: 5000, persist } })).rejects.toThrow();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();

    generateTextMock.mockRejectedValue(new Error('summary unavailable'));
    streamTextMock.mockImplementation(async (options) => {
      await expect(options.prepareStep({ stepNumber: 1, messages: big })).rejects.toThrow('summary unavailable');
      return { text: 'done', responseMessages: [] };
    });
    expect((await runChatLoop([{ role: 'user', content: 'go' }], { model: {}, systemPrompt: '', tools: {}, compaction: { budget: 5000, persist } })).text).toBe('done');
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns provider usage and prefers it over the byte estimate on the next turn', async () => {
    streamTextMock.mockImplementation(async (options) => {
      options.onStepFinish({ usage: { inputTokens: 100, outputTokens: 20 }, toolCalls: [], toolResults: [] });
      return { text: 'done', responseMessages: [{ role: 'assistant', content: 'done' }] };
    });
    const result = await runChatLoop([{ role: 'user', content: 'small' }], { model: {}, systemPrompt: '', tools: {} });
    expect(result.usage).toEqual({ totalTokens: 120, messageCount: 2 });

    generateTextMock.mockClear();
    const large = Array.from({ length: 12 }, (_, i) => ({ role: 'user' as const, content: `${i}: ${'x'.repeat(3000)}` }));
    const persist = vi.fn();
    streamTextMock.mockResolvedValue({ text: 'done', responseMessages: [] });
    await runChatLoop(large, { model: {}, systemPrompt: '', tools: {}, compaction: { budget: 5000, usage: { totalTokens: 100, messageCount: large.length }, persist } });
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('supports a caller step limit', async () => {
    streamTextMock.mockResolvedValue({
      text: Promise.resolve('done'),
      responseMessages: [{ role: 'assistant', content: [{ type: 'text', text: 'done' }] }],
    });
    await runChatLoop([], { model: {}, systemPrompt: '', tools: {}, maxSteps: 12 });
    expect(stepCountIsMock).toHaveBeenCalledWith(12);
  });
});
