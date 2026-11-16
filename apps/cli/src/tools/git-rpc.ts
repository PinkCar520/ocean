import { toAgentToolSet } from './index.js';
import type { ToolContext } from '../types.js';

/** Device calls share Agent validation, ownership and policy checks. No implicit approval. */
export function createGitRpc(workspace: string) {
  return async (method: string, params: Record<string, unknown>, context: ToolContext) => {
    const input = { ...params, action: method === 'local_git' ? params.action : method.replace(/^git_/, '') };
    const tools = await toAgentToolSet({ ...context, cwd: workspace });
    const tool = tools.local_git;
    const blocked = await tool.beforeApproval(input);
    if (blocked) throw new Error(blocked);
    if (tool.requiresApproval(input)) throw new Error('Git operation requires an independent approval; device RPC has no approval handler.');
    const output = await tool.execute(input, { abortSignal: context.signal, toolCallId: context.toolCallId });
    if (output?.error) throw new Error(output.error);
    return output;
  };
}
