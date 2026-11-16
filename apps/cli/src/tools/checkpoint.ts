import { z } from 'zod';
import { Checkpoints } from '../utils/checkpoints.js';
import { PermissionPolicy } from '../utils/permission-policy.js';
import type { ToolContext } from '../types.js';
export function createCheckpointTool() {
  return {
    description: 'List tracked file checkpoints, inspect before/current content, or safely roll back a checkpoint. Shell and remote effects are not tracked.',
    inputSchema: z.object({ action: z.enum(['list', 'diff', 'rollback', 'delete']), id: z.string().optional(), path: z.string().optional() }),
    async execute(input: { action: string; id?: string; path?: string }, context: ToolContext) {
      const store = new Checkpoints(context);
      if (input.action === 'list') return { data: (await store.list()).map(({ id, status, runId, toolCallId, files }) => ({ id, status, runId, toolCallId, files: files.map((file) => file.path) })) };
      if (input.action === 'delete' && input.path) {
        if (new PermissionPolicy(context.cwd).evaluate('file_write', { path: input.path }) === 'deny') throw new Error('Permission policy denied file deletion');
        return { data: { checkpointId: await store.change([{ path: input.path, content: null }]) } };
      }
      if (!input.id) throw new Error('Checkpoint id required');
      const checkpoint = await store.get(input.id);
      const policy = new PermissionPolicy(context.cwd);
      for (const file of checkpoint.files) {
        if (policy.evaluate(input.action === 'rollback' ? 'file_write' : 'file_read', { path: file.path }) === 'deny') throw new Error('Permission policy denied checkpoint access');
      }
      if (input.action === 'diff') return { data: await store.diff(input.id) };
      if (input.action !== 'rollback') throw new Error('Invalid checkpoint action');
      await store.rollback(input.id);
      return { data: { id: input.id, status: 'rolled_back' } };
    },
  };
}
