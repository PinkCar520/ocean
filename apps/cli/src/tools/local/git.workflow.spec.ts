import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { GitTool } from './git.js';
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'ocean-git-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com');
  await writeFile(join(root, 'agent.ts'), 'old'); await writeFile(join(root, 'user.ts'), 'old');
  git(root, 'add', '--', 'agent.ts', 'user.ts'); git(root, 'commit', '-m', 'initial');
  return root;
}
describe('safe Git workflow', () => {
  it('refuses a commit without an explicit reviewed file manifest', async () => {
    const root = await repository();
    try {
      await writeFile(join(root, 'user.ts'), 'user'); git(root, 'add', '--', 'user.ts');
      const head = git(root, 'rev-parse', 'HEAD');
      expect((await new GitTool(root).execute({ action: 'commit', message: 'agent change' })).success).toBe(false);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
      expect(git(root, 'diff', '--cached', '--name-only')).toBe('user.ts');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

import { createHash } from 'node:crypto';
import { Checkpoints } from '../../utils/checkpoints.js';
import { createGitAgentTool } from './git-agent.js';
import { SessionStore } from '../../utils/session-store.js';
import { toAgentToolSet } from '../index.js';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
it('commits only checkpoint-owned files and preserves unrelated staged/unstaged user changes', async () => {
  const root = await repository();
  try {
    const context = { cwd: root, userId: 'u', sessionId: 's' };
    await writeFile(join(root, 'user.ts'), 'staged user'); git(root, 'add', '--', 'user.ts');
    await writeFile(join(root, 'user.ts'), 'unstaged user');
    const checkpointId = await new Checkpoints(context).change([{ path: 'agent.ts', content: 'agent change' }]);
    const manifest = { paths: ['agent.ts'], expectedHead: git(root, 'rev-parse', 'HEAD'), expectedHashes: { 'agent.ts': hash('agent change') }, checkpointIds: [checkpointId] };
    const tool = createGitAgentTool(root);
    expect(await tool.execute({ action: 'add', ...manifest }, context)).not.toHaveProperty('error');
    expect(await tool.execute({ action: 'commit', message: 'agent fix', ...manifest }, context)).not.toHaveProperty('error');
    const committed = git(root, 'rev-parse', 'HEAD');
    expect(await tool.execute({ action: 'commit', message: 'duplicate', ...manifest }, context)).toHaveProperty('error');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(committed);
    expect(git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe('agent.ts');
    expect(git(root, 'show', ':user.ts')).toBe('staged user');
    expect(await readFile(join(root, 'user.ts'), 'utf8')).toBe('unstaged user');
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('user.ts');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('refuses checkpoint ownership when user edits predate or follow the agent change', async () => {
  const root = await repository();
  try {
    const context = { cwd: root, userId: 'u', sessionId: 's' };
    await writeFile(join(root, 'agent.ts'), 'user before');
    const id = await new Checkpoints(context).change([{ path: 'agent.ts', content: 'agent after' }]);
    expect(await createGitAgentTool(root).execute({ action: 'commit', paths: ['agent.ts'], message: 'unsafe', expectedHead: git(root, 'rev-parse', 'HEAD'), expectedHashes: { 'agent.ts': hash('agent after') }, checkpointIds: [id] }, context)).toHaveProperty('error');
    expect(git(root, 'log', '-1', '--format=%s')).toBe('initial');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('creates isolated worktrees, executes tools there, persists binding and refuses dirty removal', async () => {
  const root = await repository();
  try {
    const store = new SessionStore(join(root, 'sessions'));
    const session = await store.create(root);
    const context = { cwd: root, userId: 'u', sessionId: session.id };
    const tools = await toAgentToolSet(context, undefined, [], store);
    expect(await tools.local_git.execute({ action: 'worktree_add', name: 'task-a', branch: 'task/a' }, {})).not.toHaveProperty('error');
    expect(await tools.local_git.execute({ action: 'worktree_add', name: 'task-b', branch: 'task/b' }, {})).not.toHaveProperty('error');
    expect(await tools.local_git.execute({ action: 'worktree_enter', name: 'task-a' }, {})).not.toHaveProperty('error');
    const target = join(root, '.ocean/worktrees/task-a');
    const restoredTools = await toAgentToolSet(context, undefined, [], new SessionStore(join(root, 'sessions')));
    expect((await restoredTools.file_write.execute({ path: 'agent.ts', content: 'isolated' }, {})).error).toBeUndefined();
    expect(await readFile(join(target, 'agent.ts'), 'utf8')).toBe('isolated');
    expect(await readFile(join(root, 'agent.ts'), 'utf8')).toBe('old');
    expect(await readFile(join(root, '.ocean/worktrees/task-b/agent.ts'), 'utf8')).toBe('old');
    const shell = await restoredTools.bash.execute({ command: 'pwd' }, {});
    expect(shell.data.stdout.trim()).toBe(await realpath(target));
    await restoredTools.local_git.execute({ action: 'worktree_leave' }, {});
    expect(await restoredTools.local_git.execute({ action: 'worktree_remove', name: 'task-a' }, {})).toHaveProperty('error');
    expect(await restoredTools.local_git.execute({ action: 'worktree_remove', name: 'task-b' }, {})).not.toHaveProperty('error');
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { execFileSync as exec } from 'node:child_process';
it('restores worktree binding and file tool execution in a fresh process', async () => {
  const root = await repository();
  try {
    const storeRoot = join(root, 'sessions');
    const store = new SessionStore(storeRoot);
    const session = await store.create(root);
    const tool = createGitAgentTool(root, store);
    const context = { cwd: root, userId: 'u', sessionId: session.id };
    await tool.execute({ action: 'worktree_add', name: 'restart', branch: 'task/restart' }, context);
    expect(await tool.execute({ action: 'worktree_add', name: 'restart', branch: 'task/restart' }, context)).toHaveProperty('existing', true);
    await tool.execute({ action: 'worktree_enter', name: 'restart' }, context);
    const script = `import {SessionStore} from './src/utils/session-store.ts'; import {toAgentToolSet} from './src/tools/index.ts'; const tools=await toAgentToolSet({cwd:process.argv[1],userId:'u',sessionId:process.argv[3]},undefined,[],new SessionStore(process.argv[2])); const result=await tools.file_read.execute({path:'agent.ts'},{}); console.log(JSON.stringify(result));`;
    const result = JSON.parse(exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, root, storeRoot, session.id], { encoding: 'utf8' }));
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result)).toContain('.ocean/worktrees/restart');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('distinguishes staged, unstaged, untracked and renamed paths with spaces', async () => {
  const root = await repository();
  try {
    git(root, 'mv', 'agent.ts', 'renamed file.ts');
    await writeFile(join(root, 'user.ts'), 'unstaged');
    await writeFile(join(root, 'new file.ts'), 'untracked');
    const status = await new GitTool(root).execute({ action: 'status' });
    expect(status.data.staged).toContainEqual(expect.objectContaining({ index: 'R', path: 'renamed file.ts', originalPath: 'agent.ts' }));
    expect(status.data.unstaged).toHaveLength(1);
    expect(status.data.untracked).toEqual(['new file.ts']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('does not start a worktree creation after cancellation', async () => {
  const root = await repository();
  try {
    const controller = new AbortController(); controller.abort();
    const result = await new GitTool(root).execute({ action: 'worktree_add', name: 'cancelled', branch: 'task/cancelled' }, { signal: controller.signal });
    expect(result.success).toBe(false);
    expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain('task/cancelled');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('protects a pre-existing staged version of the selected file', async () => {
  const root = await repository();
  try {
    await writeFile(join(root, 'agent.ts'), 'user staged'); git(root, 'add', '--', 'agent.ts');
    await writeFile(join(root, 'agent.ts'), 'old');
    const context = { cwd: root, userId: 'u', sessionId: 's' };
    const id = await new Checkpoints(context).change([{ path: 'agent.ts', content: 'agent' }]);
    const result = await createGitAgentTool(root).execute({ action: 'commit', message: 'blocked', paths: ['agent.ts'], expectedHead: git(root, 'rev-parse', 'HEAD'), expectedHashes: { 'agent.ts': hash('agent') }, checkpointIds: [id] }, context);
    expect(result).toHaveProperty('error', 'Pre-existing staged changes in agent.ts');
    expect(git(root, 'show', ':agent.ts')).toBe('user staged');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('P0: a concurrent HEAD change rejects the stale manifest without changing index or HEAD', async () => {
 const root = await repository();
 try {
  const expectedHead = git(root, 'rev-parse', 'HEAD');
  // Trigger: another writer advances HEAD after review.
  git(root, 'commit', '--allow-empty', '-m', 'concurrent');
  const currentHead = git(root, 'rev-parse', 'HEAD');
  await writeFile(join(root, 'agent.ts'), 'agent change');
  const result = await new GitTool(root).execute({ action: 'commit', message: 'must not commit', paths: ['agent.ts'], expectedHead, expectedHashes: { 'agent.ts': hash('agent change') } });
  expect(result).toMatchObject({ success: false, error: expect.stringContaining('HEAD changed') });
  // Forbidden: stale commit or index mutation. Recovery: re-review current HEAD.
  expect(git(root, 'rev-parse', 'HEAD')).toBe(currentHead);
  expect(git(root, 'diff', '--cached', '--name-only')).toBe('');
  expect(await readFile(join(root, 'agent.ts'), 'utf8')).toBe('agent change');
 } finally { await rm(root, { recursive: true, force: true }); }
});
