import { describe, expect, it, vi } from 'vitest';
import { applyApprovalGate } from './chat.js';

describe('Agent tool approval gate', () => {
  it('fails closed when an approval channel is unavailable', async () => {
    const execute = vi.fn(async () => 'side effect');
    const gated = applyApprovalGate({ write: { requiresApproval: true, execute } });

    const result = await gated.write.execute({ path: 'x' }, {});

    expect(execute).not.toHaveBeenCalled();
    expect(result.text).toContain('审批不可用');
  });

  it('executes only after explicit approval', async () => {
    const execute = vi.fn(async () => 'side effect');
    const approval = vi.fn(async () => 'approved' as const);
    const gated = applyApprovalGate(
      { write: { requiresApproval: true, execute } },
      approval,
    );

    await expect(gated.write.execute({ path: 'x' }, {})).resolves.toBe('side effect');
    expect(approval).toHaveBeenCalledWith('write', { path: 'x' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('preserves read-only tools without invoking approval', async () => {
    const execute = vi.fn(async () => 'read result');
    const approval = vi.fn();
    const gated = applyApprovalGate({ read: { execute } }, approval);

    await expect(gated.read.execute({}, {})).resolves.toBe('read result');
    expect(approval).not.toHaveBeenCalled();
  });

  it('applies approval by tool input for structured Git reads and writes', async () => {
    const execute = vi.fn(async (args: any) => args.action);
    const approval = vi.fn(async () => 'approved' as const);
    const gated = applyApprovalGate({
      local_git: {
        requiresApproval: (args: any) => !['status', 'diff', 'worktree_list'].includes(args.action),
        execute,
      },
    }, approval);

    await expect(gated.local_git.execute({ action: 'status' }, {})).resolves.toBe('status');
    await expect(gated.local_git.execute({ action: 'worktree_remove' }, {})).resolves.toBe('worktree_remove');
    expect(approval).toHaveBeenCalledOnce();
    expect(approval).toHaveBeenCalledWith('local_git', { action: 'worktree_remove' });
  });

  it('runs a plan-mode preflight before requesting approval and hides gate metadata', async () => {
    const execute = vi.fn(async () => 'side effect');
    const approval = vi.fn(async () => 'approved' as const);
    const gated = applyApprovalGate({
      write: {
        requiresApproval: true,
        beforeApproval: async () => 'Plan mode is active.',
        execute,
      },
    }, approval);

    await expect(gated.write.execute({ path: 'x' }, {})).resolves.toMatchObject({
      error: 'Plan mode is active.',
    });
    expect(approval).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(gated.write).not.toHaveProperty('beforeApproval');
    expect(gated.write).not.toHaveProperty('requiresApproval');
  });
});
