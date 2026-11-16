import { describe, expect, it } from 'vitest';
import { buildGitArgs, tokenizeGitArgs } from './git.js';
import { createGitAgentTool } from './git-agent.js';

describe('local Git tool argument boundary', () => {
  it('tokenizes quoted legacy arguments without shell evaluation', () => {
    expect(tokenizeGitArgs('--oneline -n 5')).toEqual(['--oneline', '-n', '5']);
    expect(tokenizeGitArgs("-m 'message with spaces' $(touch /tmp/marker)")).toEqual([
      '-m', 'message with spaces', '$(touch', '/tmp/marker)',
    ]);
  });

  it('only permits read-only branch listing and narrow status/log/diff options', () => {
    expect(buildGitArgs({ action: 'branch' })).toEqual(['--show-current']);
    expect(() => buildGitArgs({ action: 'branch', args: '--delete main' })).toThrow();
    expect(() => buildGitArgs({ action: 'log', args: '--format=%x' })).toThrow();
    expect(buildGitArgs({ action: 'log', args: '--oneline -n 5' })).toEqual(['--oneline', '-n', '5']);
  });

  it('requires structured arguments for writes and push', () => {
    expect(buildGitArgs({ action: 'add', paths: ['src/app.ts'] })).toEqual(['--', 'src/app.ts']);
    expect(buildGitArgs({ action: 'commit', message: 'fix: example' })).toEqual(['-m', 'fix: example']);
    expect(buildGitArgs({ action: 'push', remote: 'origin', branch: 'main' })).toEqual(['origin', 'main']);
    expect(() => buildGitArgs({ action: 'push', args: '--force origin main' })).toThrow();
  });

  it('creates and removes only named worktrees with validated branch names', () => {
    expect(buildGitArgs({ action: 'worktree_list' })).toEqual(['list', '--porcelain']);
    expect(buildGitArgs({
      action: 'worktree_add',
      name: 'feature-42',
      branch: 'feature/42',
    })).toEqual(['add', '-b', 'feature/42', '.ocean/worktrees/feature-42']);
    expect(buildGitArgs({ action: 'worktree_remove', name: 'feature-42' }))
      .toEqual(['remove', '.ocean/worktrees/feature-42']);
    expect(() => buildGitArgs({ action: 'worktree_add', name: '../outside', branch: 'main' })).toThrow();
    expect(() => buildGitArgs({ action: 'worktree_add', name: 'test', branch: '--force' })).toThrow();
  });

  it('gates only Git actions that can change repository state', () => {
    const tool = createGitAgentTool(process.cwd());
    expect(tool.requiresApproval({ action: 'status' })).toBe(false);
    expect(tool.requiresApproval({ action: 'worktree_list' })).toBe(false);
    expect(tool.requiresApproval({ action: 'worktree_add' })).toBe(true);
    expect(tool.requiresApproval({ action: 'push' })).toBe(true);
  });
});
