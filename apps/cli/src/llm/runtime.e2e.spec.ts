import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
const { isolatedHome } = vi.hoisted(() => ({ isolatedHome: `${process.env.TMPDIR ?? '/tmp'}/ocean-e2e-empty-home-${process.pid}-${Date.now()}` }));
vi.mock('node:os', async (original) => ({ ...await original<typeof import('node:os')>(), homedir: () => isolatedHome }));
beforeAll(async () => { await mkdir(isolatedHome, { recursive: true }); });
afterAll(async () => { await rm(isolatedHome, { recursive: true, force: true }); });
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream, type ModelMessage } from 'ai';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runChatLoop } from './chat.js';
import { toAgentToolSet } from '../tools/index.js';
import { SessionStore } from '../utils/session-store.js';
import { LifecycleHooks } from '../utils/lifecycle-hooks.js';
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const stream = (chunks: any[], reason = 'stop') => ({ stream: simulateReadableStream({ chunks: [{ type: 'stream-start', warnings: [] }, ...chunks, { type: 'finish', finishReason: { unified: reason, raw: reason }, usage }] }) });
const text = (value: string) => [{ type: 'text-start', id: 'text' }, { type: 'text-delta', id: 'text', delta: value }, { type: 'text-end', id: 'text' }];

describe('real SDK Agent execution E2E', () => {
  it('runs prompt -> approval -> file tool -> result -> stop -> persisted history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-e2e-'));
    try {
      const store = new SessionStore(join(root, 'sessions'));
      const session = await store.create(root);
      const tools = await toAgentToolSet({ cwd: root, userId: 'u', sessionId: session.id }, undefined, [], store);
      const approvals: string[] = [];
      const model = new MockLanguageModelV3({ doStream: [
        stream([{ type: 'tool-call', toolCallId: 'write-1', toolName: 'file_write', input: JSON.stringify({ path: 'result.ts', content: 'export const answer = 42;' }) }], 'tool-calls'),
        stream(text('Created result.ts')),
      ] as any });
      const hooks = new LifecycleHooks({ PreToolUse: [{ matcher: 'file_write', hooks: [{ type: 'command', command: 'exit 0' }] }], Stop: [{ hooks: [{ type: 'command', command: 'exit 0' }] }] }, root);
      const messages: ModelMessage[] = [{ role: 'user', content: 'Create result.ts with answer 42' }];
      await store.save(session.id, root, messages);
      const result = await runChatLoop(messages, { model, tools, systemPrompt: 'Complete the user task.', hooks, approvalHandler: async (name) => { approvals.push(name); return 'approved'; } });
      expect(result.text).toBe('Created result.ts');
      expect(approvals).toEqual(['file_write']);
      expect(await readFile(join(root, 'result.ts'), 'utf8')).toBe('export const answer = 42;');
      expect(result.toolResults).toHaveLength(1);
      expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain('write-1');
      await store.save(session.id, root, [...messages, ...result.responseMessages]);
      const restored = await new SessionStore(join(root, 'sessions')).load(session.id, root);
      expect(restored.messages).toEqual([...messages, ...result.responseMessages]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

import { execFileSync } from 'node:child_process';
import { contextTokens } from './compaction.js';
it('automatically compacts, executes a real tool, and restores the summary and full history across processes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-e2e-compact-'));
  try {
    const storeRoot = join(root, 'sessions');
    const store = new SessionStore(storeRoot);
    const session = await store.create(root);
    const messages: ModelMessage[] = Array.from({ length: 16 }, (_, index) => ({ role: 'user', content: `${index}: Keep dependencies unchanged. ${'context '.repeat(500)}` }));
    messages.push({ role: 'user', content: 'Write the final result to result.ts' });
    await store.save(session.id, root, messages);
    const tools = await toAgentToolSet({ cwd: root, userId: 'u', sessionId: session.id }, undefined, [], store);
    const model = new MockLanguageModelV3({
      doGenerate: { content: [{ type: 'text', text: JSON.stringify({ goal: 'Write result.ts', constraints: ['Keep dependencies unchanged'], fileChanges: [], failedTests: [], completedTools: [], pendingWork: ['Write result'] }) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] } as any,
      doStream: [stream([{ type: 'tool-call', toolCallId: 'compact-write', toolName: 'file_write', input: JSON.stringify({ path: 'result.ts', content: 'done' }) }], 'tool-calls'), stream(text('finished'))] as any,
    });
    const result = await runChatLoop(messages, { model, tools, systemPrompt: '', approvalHandler: async () => 'approved', compaction: { budget: 5000, persist: async (snapshot) => { await store.saveCompaction(session.id, root, snapshot); } } });
    expect(result.text).toBe('finished');
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain('Keep dependencies unchanged');
    expect(JSON.stringify(model.doStreamCalls[0].prompt).length).toBeLessThan(JSON.stringify(messages).length);
    await store.save(session.id, root, [...messages, ...result.responseMessages]);
    const script = `import {SessionStore} from './src/utils/session-store.ts'; const session=await new SessionStore(process.argv[1]).load(process.argv[2],process.argv[3]); console.log(JSON.stringify(session));`;
    const restored = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, storeRoot, session.id, root], { encoding: 'utf8' }));
    expect(restored.compaction.covered).toBeGreaterThan(0);
    expect(restored.messages).toEqual([...messages, ...result.responseMessages]);
    const nextModel = new MockLanguageModelV3({ doStream: stream(text('continued without replay')) as any });
    const next = await runChatLoop(restored.messages, { model: nextModel, tools, systemPrompt: '', compaction: { previous: restored.compaction, persist: async () => { throw new Error('Unexpected repeat compaction'); } } });
    expect(next.text).toBe('continued without replay');
    expect(nextModel.doStreamCalls).toHaveLength(1);
    expect(contextTokens(restored.messages)).toBeGreaterThan(5000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { mkdir, writeFile } from 'node:fs/promises';
import { discoverSkills } from '../skills/loader.js';
import { McpClientManager } from '../mcp/client.js';
import { resolve } from 'node:path';
it('selects a lazy skill and continues with its instructions through actual SDK tool results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-e2e-skill-'));
  try {
    await mkdir(join(root, '.ocean/skills/review'), { recursive: true });
    await writeFile(join(root, '.ocean/skills/review/SKILL.md'), '---\nname: review\ndescription: Review authentication\n---\nCheck expired tokens.');
    const skills = discoverSkills(root, root);
    const tools = await toAgentToolSet({ cwd: root, userId: 'u', sessionId: 's' }, undefined, skills);
    const model = new MockLanguageModelV3({ doStream: [stream([{ type: 'tool-call', toolCallId: 'activate', toolName: 'activate_skill', input: '{"skill_name":"review"}' }], 'tool-calls'), stream(text('Checked token expiry'))] as any });
    const result = await runChatLoop([{ role: 'user', content: 'Review authentication' }], { model, tools, systemPrompt: '' });
    expect(result.text).toBe('Checked token expiry');
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain('Check expired tokens.');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('delegates to an isolated read-only child through the actual SDK and continues the parent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-e2e-child-'));
  try {
    await mkdir(join(root, '.ocean/agents'), { recursive: true });
    await writeFile(join(root, '.ocean/agents/review.md'), '---\nname: review\ndescription: Review a file\ntools: file_read, bash\nmaxTurns: 3\n---\nInspect only the delegated file.');
    await writeFile(join(root, 'source.ts'), 'export const broken = true;');
    const tools = await toAgentToolSet({ cwd: root, userId: 'u', sessionId: 's' });
    const model = new MockLanguageModelV3({ doStream: [
      stream([{ type: 'tool-call', toolCallId: 'delegate', toolName: 'delegate_task', input: '{"agent":"review","task":"Review source.ts"}' }], 'tool-calls'),
      stream([{ type: 'tool-call', toolCallId: 'read', toolName: 'file_read', input: '{"path":"source.ts"}' }], 'tool-calls'),
      stream(text('Child found broken=true')),
      stream(text('Parent received child result')),
    ] as any });
    const result = await runChatLoop([{ role: 'user', content: 'PRIVATE_PARENT_CONTEXT' }], { model, tools, systemPrompt: 'Respect permissions', delegation: { workspace: root } });
    expect(result.text).toBe('Parent received child result');
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).not.toContain('PRIVATE_PARENT_CONTEXT');
    expect(model.doStreamCalls[1].tools?.map((tool) => tool.name)).not.toContain('bash');
    expect(JSON.stringify(model.doStreamCalls[3].prompt)).toContain('Child found broken=true');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('calls a real local stdio MCP server through approval and the actual SDK loop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-e2e-mcp-'));
  const manager = new McpClientManager({ workspacePath: root } as any);
  try {
    const config = join(root, 'mcp.json');
    await writeFile(config, JSON.stringify({ mcpServers: { echo: { command: process.execPath, args: [resolve('src/mcp/fixtures/echo.mjs')], enabled: true } } }));
    await manager.loadConfig(config); await manager.connectAll();
    const tools = await toAgentToolSet({ cwd: root, userId: 'u', sessionId: 's' }, manager);
    let approvals = 0;
    const model = new MockLanguageModelV3({ doStream: [stream([{ type: 'tool-call', toolCallId: 'mcp-call', toolName: 'mcp__echo__echo', input: '{"text":"local MCP result"}' }], 'tool-calls'), stream(text('MCP completed'))] as any });
    const result = await runChatLoop([{ role: 'user', content: 'Call echo' }], { model, tools, systemPrompt: '', approvalHandler: async () => { approvals++; return 'approved'; } });
    expect(result.text).toBe('MCP completed');
    expect(approvals).toBe(1);
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain('local MCP result');
  } finally { await manager.disconnectAll(); await rm(root, { recursive: true, force: true }); }
});

it('cancels after approval wins without executing the pending filesystem side effect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-e2e-cancel-'));
  try {
    const controller = new AbortController();
    const tools = await toAgentToolSet({ cwd: root, userId: 'u', sessionId: 's' });
    const model = new MockLanguageModelV3({ doStream: [stream([{ type: 'tool-call', toolCallId: 'cancel-write', toolName: 'file_write', input: '{"path":"must-not-exist","content":"unsafe"}' }], 'tool-calls'), stream(text('late result'))] as any });
    await expect(runChatLoop([{ role: 'user', content: 'write' }], { model, tools, systemPrompt: '', signal: controller.signal, approvalHandler: async () => { controller.abort(new Error('user cancelled')); return 'approved'; } })).rejects.toThrow();
    await expect(readFile(join(root, 'must-not-exist'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('feeds a blocking Stop hook back to the actual SDK once, then finishes safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-e2e-stop-'));
  try {
    const command = `node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s).stop_hook_active?{}:{decision:"block",reason:"Run verification"})))'`;
    const hooks = new LifecycleHooks({ Stop: [{ hooks: [{ type: 'command', command }] }] }, root);
    const model = new MockLanguageModelV3({ doStream: [stream(text('initial answer')), stream(text('verified answer'))] as any });
    const result = await runChatLoop([{ role: 'user', content: 'finish task' }], { model, tools: {}, systemPrompt: '', hooks });
    expect(result.text).toBe('verified answer');
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain('Run verification');
  } finally { await rm(root, { recursive: true, force: true }); }
});
