import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toAgentToolSet } from './index.js';
import { SessionStore } from '../utils/session-store.js';

describe('CLI Agent tool adapter', () => {
  let tempRoot = '';

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it('uses the AI SDK inputSchema contract and preserves write approval metadata', async () => {
    const tools = await toAgentToolSet({ cwd: process.cwd(), userId: 'tester', sessionId: 'test-session' });

    expect(tools.file_read.inputSchema).toBeDefined();
    expect('parameters' in tools.file_read).toBe(false);
    expect(tools.file_write.inputSchema).toBeDefined();
    expect(tools.file_write.requiresApproval({ path: 'notes.txt', content: 'x' })).toBe(true);
    expect(tools.file_edit.requiresApproval({ path: 'notes.txt', old_string: 'x', new_string: 'y' })).toBe(true);
    expect(tools.bash.requiresApproval({ command: 'git status' })).toBe(false);
    expect(tools.bash.requiresApproval({ command: 'git commit -m change' })).toBe(true);
    expect(tools.powershell.inputSchema).toBeDefined();
    expect(tools.powershell.requiresApproval({ command: 'Get-ChildItem' })).toBe(true);
  });

  it('exposes MCP schemas, requires approval, and propagates cancellation', async () => {
    const callTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'found' }] });
    const manager = {
      getAllTools: async () => [{
        name: 'mcp__docs__search',
        description: 'Search internal docs',
        server: 'docs',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      }],
      callTool,
    } as any;
    const tools = await toAgentToolSet(
      { cwd: process.cwd(), userId: 'tester', sessionId: 'test-session' },
      manager,
    );
    const abortController = new AbortController();

    expect(tools.mcp__docs__search.inputSchema).toBeDefined();
    expect(tools.mcp__docs__search.requiresApproval({ query: 'run recovery' })).toBe(true);
    await tools.mcp__docs__search.execute(
      { query: 'run recovery' },
      { abortSignal: abortController.signal },
    );
    expect(callTool).toHaveBeenCalledWith(
      'mcp__docs__search',
      { query: 'run recovery' },
      { signal: abortController.signal },
    );
  });

  it('loads a selected skill only through the explicit activation tool', async () => {
    const skill = {
      manifest: { name: 'review', description: 'Review a code change' },
      content: 'Check correctness and tests.',
      sourcePath: '/workspace/.ocean/skills/review',
    };
    const tools = await toAgentToolSet(
      { cwd: process.cwd(), userId: 'tester', sessionId: 'test-session' },
      undefined,
      [skill],
    );

    await expect(tools.activate_skill.execute({ skill_name: 'review' }, {})).resolves.toMatchObject({
      skill: 'review',
      instructions: 'Check correctness and tests.',
    });
    await expect(tools.activate_skill.execute({ skill_name: 'missing' }, {})).resolves.toHaveProperty('error');
  });

  it('applies shared permission modes and global deny rules before local execution', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-cli-permissions-'));
    const workspace = path.join(tempRoot, 'workspace');
    await mkdir(path.join(workspace, '.ocean'), { recursive: true });
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({
      mode: 'bypassPermissions',
      deny: ['Edit(secrets/**)'],
    }));
    const tools = await toAgentToolSet({ cwd: workspace, userId: 'tester', sessionId: 'policy-test' });

    expect(tools.file_write.requiresApproval({ path: 'notes.txt', content: 'x' })).toBe(false);
    expect(tools.powershell.requiresApproval({ command: 'Get-ChildItem' })).toBe(true);
    await expect(tools.file_edit.execute({ path: 'secrets/token.txt', old_string: 'x', new_string: 'y' }, {})).resolves.toMatchObject({
      error: expect.stringContaining('Permission policy denied'),
    });
  });

  it('blocks mutating and MCP tools until the persisted session plan is exited', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-plan-guard-'));
    const workspace = path.join(tempRoot, 'workspace');
    await mkdir(workspace, { recursive: true });
    const sessions = new SessionStore(path.join(tempRoot, 'sessions'));
    const session = await sessions.create(workspace);
    const context = {
      cwd: workspace,
      userId: 'tester',
      sessionId: session.id,
      getSessionId: () => session.id,
    };
    const manager = {
      getAllTools: async () => [{
        name: 'mcp__repo__write',
        description: 'Modify a remote repository',
        server: 'repo',
        inputSchema: { type: 'object', properties: {} },
      }],
      callTool: vi.fn(),
    } as any;
    const tools = await toAgentToolSet(context, manager, [], sessions);

    await tools.task_plan.execute({ action: 'start', subjects: ['Inspect before editing'] }, {});
    const readResult = await tools.file_read.execute({ path: 'README.md' }, {});
    expect(readResult.error ?? '').not.toContain('Plan mode is active');
    await expect(tools.file_write.execute({ path: 'blocked.txt', content: 'no' }, {})).resolves.toMatchObject({
      error: expect.stringContaining('Plan mode is active'),
    });
    await expect(tools.local_git.execute({ action: 'add', paths: ['blocked.txt'] }, {})).resolves.toMatchObject({
      error: expect.stringContaining('Plan mode is active'),
    });
    await expect(tools.powershell.execute({ command: 'Set-Content blocked.txt no' }, {})).resolves.toMatchObject({
      error: expect.stringContaining('Plan mode is active'),
    });
    await expect(tools.mcp__repo__write.execute({}, {})).resolves.toMatchObject({
      error: expect.stringContaining('Plan mode is active'),
    });
    expect(manager.callTool).not.toHaveBeenCalled();

    await tools.task_plan.execute({ action: 'exit' }, {});
    expect((await sessions.load(session.id, workspace)).plan?.mode).toBe('auto');
  });
});
