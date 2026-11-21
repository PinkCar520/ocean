import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../../utils/session-store.js';

describe('Git commit + stream failure recovery', () => {
  let tempRoot: string;

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  function git(repo: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  }

  async function setupRepo(): Promise<{ repo: string; store: SessionStore; sessionId: string }> {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-commit-recovery-'));
    const repo = path.join(tempRoot, 'repo');
    const sessions = path.join(tempRoot, 'sessions');
    await execFileSync('mkdir', ['-p', repo]);
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    await writeFile(path.join(repo, 'README.md'), '# test\n');
    git(repo, 'add', 'README.md');
    const store = new SessionStore(sessions);
    const session = await store.create(repo);
    return { repo, store, sessionId: session.id };
  }

  it('does not double-commit when the stream fails after a successful commit', async () => {
    const { repo, store, sessionId } = await setupRepo();

    // First attempt: commit succeeds, then stream fails
    let commitExecutions = 0;
    const commitOutput = { ok: true, hash: 'abc123' };

    await store.executeToolCall(sessionId, repo, 'call-commit-1', 'git_commit',
      { message: 'feat: add README' },
      async () => {
        commitExecutions++;
        git(repo, 'commit', '-m', 'feat: add README');
        return commitOutput;
      });

    // Verify one commit exists
    const log1 = git(repo, 'log', '--oneline').trim().split('\n').filter(Boolean);
    expect(log1).toHaveLength(1);
    expect(commitExecutions).toBe(1);

    // Simulate stream failure: retry the SAME tool call id.
    // The journal must return the cached result WITHOUT executing again.
    const retryOutput = await store.executeToolCall(sessionId, repo, 'call-commit-1', 'git_commit',
      { message: 'feat: add README' },
      async () => {
        commitExecutions++;
        git(repo, 'commit', '-m', 'feat: add README (duplicate)');
        return { ok: true, hash: 'duplicate' };
      });

    // Cached result returned, no new commit
    expect(retryOutput).toEqual(commitOutput);
    expect(commitExecutions).toBe(1);
    const log2 = git(repo, 'log', '--oneline').trim().split('\n').filter(Boolean);
    expect(log2).toHaveLength(1);
  });

  it('rejects replaying a tool call whose outcome is unknown', async () => {
    const { repo, store, sessionId } = await setupRepo();

    // First attempt: commit starts but crashes before the journal records the outcome
    await expect(store.executeToolCall(sessionId, repo, 'call-commit-2', 'git_commit',
      { message: 'wip' },
      async () => {
        git(repo, 'commit', '-m', 'wip');
        throw new Error('stream crashed before result recorded');
      })).rejects.toThrow('stream crashed');

    // The commit may have happened externally, but the journal state is 'unknown'.
    // Retrying the same call MUST NOT re-execute (safety: no blind replay).
    await expect(store.executeToolCall(sessionId, repo, 'call-commit-2', 'git_commit',
      { message: 'wip' },
      async () => {
        git(repo, 'commit', '-m', 'wip (duplicate)');
        return { ok: true };
      })).rejects.toThrow('automatic replay is prohibited');

    // At most one commit should exist (the crash happened after git commit but before journal save)
    const log = git(repo, 'log', '--oneline').trim().split('\n').filter(Boolean);
    expect(log.length).toBeLessThanOrEqual(1);
  });

  it('succeeds on retry when the first attempt failed cleanly (no side effects)', async () => {
    const { repo, store, sessionId } = await setupRepo();

    // First attempt: tool throws before any side effect
    await expect(store.executeToolCall(sessionId, repo, 'call-commit-3', 'git_commit',
      { message: 'fail' },
      async () => { throw new Error('git not found'); })).rejects.toThrow('git not found');

    // No commit yet
    try {
      expect(git(repo, 'log', '--oneline').trim()).toBe('');
    } catch {
      // git log returns non-zero on a repo with no commits
    }

    // Retry with a DIFFERENT tool call id (new attempt) — should succeed
    const result = await store.executeToolCall(sessionId, repo, 'call-commit-3-retry', 'git_commit',
      { message: 'feat: retry' },
      async () => {
        git(repo, 'commit', '-m', 'feat: retry');
        return { ok: true };
      });
    expect(result).toEqual({ ok: true });
    const log = git(repo, 'log', '--oneline').trim().split('\n').filter(Boolean);
    expect(log).toHaveLength(1);
  });
});
