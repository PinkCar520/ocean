import { z } from 'zod';
import { GitTool } from './git.js';
import type { ToolContext } from '../../types.js';

const READ_ONLY_ACTIONS = new Set([
  'status',
  'log',
  'diff',
  'branch',
  'worktree_list',
]);

export function createGitAgentTool(workspace: string) {
  const git = new GitTool(workspace);
  return {
    name: 'local_git',
    description: 'Inspect or modify the workspace Git repository using structured, validated operations.',
    requiresApproval: (input: { action?: string }) => !READ_ONLY_ACTIONS.has(input?.action ?? ''),
    inputSchema: z.object({
      action: z.enum([
        'status', 'log', 'diff', 'branch', 'add', 'commit', 'push',
        'worktree_list', 'worktree_add', 'worktree_remove',
      ]),
      args: z.string().optional().describe('Narrow read-only options only; writes use structured fields'),
      paths: z.array(z.string()).optional().describe('Workspace paths for add/diff'),
      message: z.string().optional().describe('Commit message'),
      remote: z.string().optional().describe('Explicit push remote'),
      branch: z.string().optional().describe('Explicit push branch or new worktree branch'),
      name: z.string().optional().describe('Managed worktree name'),
    }),
    async execute(input: Record<string, unknown>, context: ToolContext) {
      const result = await git.execute(input as any, { signal: context.signal });
      return result.success ? result.data : { error: result.error ?? 'Git action failed.' };
    },
  };
}
