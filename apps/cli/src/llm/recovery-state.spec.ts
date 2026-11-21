import { describe, it, expect } from 'vitest';
import { recoveryStatePrompt } from './recovery-state.js';
import type { StoredSession } from '../utils/session-store.js';

const session = (): StoredSession => ({
  version: 1, id: 's', workspace: '/workspace', title: 'task',
  createdAt: '', updatedAt: '', messages: [],
});

describe('durable post-compaction recovery', () => {
  it('does not add unnecessary state when no execution metadata exists', () => {
    expect(recoveryStatePrompt(session())).toBe('');
  });

  it('preserves worktree and unresolved subagent state without claiming completion', () => {
    const s = session();
    s.worktree = { path: '/workspace/.worktrees/task', branch: 'feature/task' };
    s.subagent = {
      parentSessionId: 'parent', toolCallId: 'call-1', agent: 'worker',
      inputDigest: 'digest', status: 'unknown',
    };
    const prompt = recoveryStatePrompt(s);
    expect(prompt).toContain('feature/task');
    expect(prompt).toContain('"status":"unknown"');
    expect(prompt).toContain('never replay side effects');
    expect(prompt).not.toContain('inputDigest');
  });

  it('fails closed instead of truncating oversized structured state', () => {
    const s = session();
    s.worktree = { path: 'x'.repeat(40000), branch: 'feature/task' };
    expect(() => recoveryStatePrompt(s)).toThrow('32 KB');
  });
});
