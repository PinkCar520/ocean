import type { PlanStorage } from '../task-plan.js';
import { SecurityEngine } from '../../utils/security.js';
import { Checkpoints } from '../../utils/checkpoints.js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
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

export function createGitAgentTool(workspace: string, storage?: PlanStorage) {
  const git = new GitTool(workspace);
  return {
    name: 'local_git',
    description: 'Inspect Git status/diff or manage worktrees. add/commit require explicit paths, reviewed expectedHead, expectedHashes (SHA-256 or null for deletion), and ordered applied checkpointIds from checkpoint list/diff. worktree_enter binds this session; worktree_leave retains files. Commits preserve unrelated staging.',
    requiresApproval: (input: { action?: string }) => !READ_ONLY_ACTIONS.has(input?.action ?? ''),
    inputSchema: z.object({
      action: z.enum([
        'status', 'log', 'diff', 'branch', 'add', 'commit', 'push',
        'worktree_list', 'worktree_add', 'worktree_remove', 'worktree_enter', 'worktree_leave',
      ]),
      args: z.string().optional().describe('Narrow read-only options only; writes use structured fields'),
      paths: z.array(z.string()).optional().describe('Workspace paths for add/diff'),
      message: z.string().optional().describe('Commit message'),
      remote: z.string().optional().describe('Explicit push remote'),
      branch: z.string().optional().describe('Explicit push branch or new worktree branch'),
      name: z.string().optional().describe('Managed worktree name'),
      expectedHead: z.string().optional(),
      expectedHashes: z.record(z.string(), z.string().nullable()).optional(),
      checkpointIds: z.array(z.string()).optional().describe('Applied checkpoints proving ownership of every selected file'),
    }),
    async execute(input: Record<string, unknown>, context: ToolContext) {
      if (input.action === 'worktree_enter' || input.action === 'worktree_leave') {
        if (!storage?.saveWorktree) return { error: 'Worktree binding requires a persistent session' };
        if (input.action === 'worktree_leave') {
          await storage.saveWorktree(context.sessionId, workspace, undefined);
          return { cwd: workspace, retained: true };
        }
        if (typeof input.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(input.name)) return { error: 'Invalid worktree name' };
        const target = await new SecurityEngine(workspace).resolveWorkspacePath(path.join('.ocean', 'worktrees', input.name));
        const listing = await git.execute({ action: 'worktree_list' }, { signal: context.signal });
        const registered = listing.success && listing.data.find((item: any) => item.worktree === target);
        if (!registered || typeof registered.branch !== 'string') return { error: 'Worktree is not registered with this repository' };
        await storage.saveWorktree(context.sessionId, workspace, { path: target, branch: registered.branch, runId: context.runId });
        return { cwd: target, branch: registered.branch };
      }
      if (input.action === 'worktree_remove' && context.cwd !== workspace) return { error: 'Leave the active worktree before removing it' };
      if (input.action === 'add' || input.action === 'commit') {
        if (!Array.isArray(input.checkpointIds) || !input.checkpointIds.length || !Array.isArray(input.paths)) return { error: 'Applied checkpoint ownership is required for every selected file' };
        const checkpoints = await Promise.all(input.checkpointIds.map((id) => new Checkpoints(context).get(String(id))));
        const hash = (text: string) => createHash('sha256').update(text).digest('hex');
        for (const selected of input.paths) {
          const file = await new SecurityEngine(context.cwd).resolveWorkspacePath(String(selected));
          const entries = checkpoints.flatMap((record) => record.status === 'applied' ? record.files.filter((entry) => entry.path === file) : []);
          if (!entries.length) return { error: `No applied checkpoint owns ${selected}` };
          let baseline: string | null = null;
          try { baseline = execFileSync('git', ['show', `HEAD:${String(selected)}`], { cwd: context.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
          let digest: string | null = baseline === null ? null : hash(baseline);
          for (const entry of entries) {
            if ((entry.before === null ? null : hash(entry.before)) !== digest) return { error: `Pre-existing user changes or checkpoint gap in ${selected}` };
            digest = entry.after;
          }
          if ((input.expectedHashes as any)?.[String(selected)] !== digest) return { error: `Untracked later changes in ${selected}` };
          let indexed: string | null = null;
          try { indexed = hash(execFileSync('git', ['show', `:${String(selected)}`], { cwd: context.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch {}
          const baselineHash = baseline === null ? null : hash(baseline);
          if (indexed !== baselineHash && indexed !== digest) return { error: `Pre-existing staged changes in ${selected}` };

        }
      }
      const executor = String(input.action).startsWith('worktree_') ? git : new GitTool(context.cwd);
      const result = await executor.execute(input as any, { signal: context.signal });
      return result.success ? result.data : { error: result.error ?? 'Git action failed.' };
    },
  };
}
