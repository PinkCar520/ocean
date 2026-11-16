import { SecurityEngine } from '../utils/security.js';
import { GitTool } from './local/git.js';
import * as path from 'node:path';
import { createCheckpointTool } from './checkpoint.js';
import { jsonSchema } from 'ai';
import type { McpClientManager } from '../mcp/client.js';
import { createBashTool, createFileReadTool, createFileWriteTool, createFileEditTool, createFilePatchTool, createGrepTool, createGlobTool } from './core-tools.js';
import type { LoadedSkill, ToolContext } from '../types.js';
import { createSkillActivationTool } from './skill-tool.js';
import { createGitAgentTool } from './local/git-agent.js';
import { createTaskPlanTool, type PlanStorage } from './task-plan.js';
import { createPowerShellTool } from './powershell.js';
import { PermissionPolicy } from '../utils/permission-policy.js';
import { NotebookSnapshots } from '../utils/notebook-snapshots.js';
import { createNotebookEditTool } from './notebook-edit.js';

/**
 * Get all available tools for the AI
 */
export function getTools(context: ToolContext, skills: LoadedSkill[] = [], planStorage?: PlanStorage) {
  const notebookSnapshots = new NotebookSnapshots();
  const taskPlan = createTaskPlanTool({
    workspace: context.cwd,
    getSessionId: context.getSessionId ?? (() => context.sessionId),
    storage: planStorage,
  });
  const tools: Record<string, any> = {
    checkpoint: createCheckpointTool(),
    bash: createBashTool(),
    powershell: createPowerShellTool(),
    file_read: createFileReadTool(notebookSnapshots),
    file_write: createFileWriteTool(),
    file_edit: createFileEditTool(),
    file_patch: createFilePatchTool(),
    notebook_edit: createNotebookEditTool(notebookSnapshots),
    grep: createGrepTool(),
    glob: createGlobTool(),
    local_git: createGitAgentTool(context.cwd, planStorage),
    task_plan: taskPlan,
  };
  if (skills.length > 0) tools.activate_skill = createSkillActivationTool(skills);
  return tools;
}

/** Adapt local tools to the current AI SDK contract and pass cancellation to executors. */
export async function toAgentToolSet(
  context: ToolContext,
  mcpManager?: McpClientManager,
  skills: LoadedSkill[] = [],
  planStorage?: PlanStorage,
) {
  const localToolSet = getTools(context, skills, planStorage);
  const permissionPolicy = new PermissionPolicy(context.cwd);
  const executionContext = async () => {
    const sessionId = context.getSessionId?.() ?? context.sessionId;
    const session = planStorage ? await planStorage.load(sessionId, context.cwd) : undefined;
    if (!session?.worktree) return { ...context, sessionId };
    const target = await new SecurityEngine(context.cwd).resolveWorkspacePath(session.worktree.path);
    const managedRoot = path.join(await new SecurityEngine(context.cwd).resolveWorkspacePath('.ocean'), 'worktrees') + path.sep;
    if (!target.startsWith(managedRoot)) throw new Error('Unsafe persisted worktree binding');
    const listing = await new GitTool(context.cwd).execute({ action: 'worktree_list' });
    if (!listing.success || !listing.data.some((item: any) => item.worktree === target && item.branch === session.worktree!.branch)) throw new Error('Persisted worktree is missing or its branch changed');
    return { ...context, sessionId, cwd: target };
  };

  const taskPlan = localToolSet.task_plan;
  const tools = Object.fromEntries(
    Object.entries(localToolSet).map(([name, definition]) => {
      const localTool = definition as any;
      return [name, {
        description: localTool.description,
        inputSchema: localTool.inputSchema,
        ...(localTool.toModelOutput ? { toModelOutput: localTool.toModelOutput } : {}),
        requiresApproval: (input: any) => (name === 'checkpoint' && ['rollback', 'delete'].includes(input?.action)) || permissionPolicy.requiresApproval(name, input, {
          alwaysAskInBypass: name === 'powershell',
        }),
        beforeApproval: async (input: any) => {
          if (name !== 'task_plan' && await taskPlan.isPlanMode() && !isAllowedDuringPlan(name, input)) {
            return `Plan mode is active. ${name} is blocked until task_plan(action="exit") ends planning.`;
          }
          return permissionPolicy.evaluate(name, input) === 'deny'
            ? `Permission policy denied ${name}. Check the active Ocean settings.`
            : undefined;
        },
        execute: async (input: any, options: { abortSignal?: AbortSignal; toolCallId?: string }) => {
          if (name !== 'task_plan' && await taskPlan.isPlanMode() && !isAllowedDuringPlan(name, input)) {
            return { error: `Plan mode is active. ${name} is blocked until task_plan(action="exit") ends planning.` };
          }
          if (permissionPolicy.evaluate(name, input) === 'deny') {
            return { error: `Permission policy denied ${name}. Check the active Ocean settings.` };
          }
          return localTool.execute(input, { ...await executionContext(), signal: options?.abortSignal, toolCallId: options?.toolCallId });
        },
      }];
    }),
  );

  if (!mcpManager) return tools;

  const mcpDefinitions = await mcpManager.getAllTools();
  for (const definition of mcpDefinitions) {
    tools[definition.name] = {
      description: definition.description || `Call ${definition.name} on MCP server ${definition.server}.`,
      inputSchema: jsonSchema(definition.inputSchema as any),
      // MCP server tools can have arbitrary side effects; require approval by default.
      requiresApproval: (input: any) => permissionPolicy.evaluate(definition.name, input, definition.server) === 'ask',
      beforeApproval: async (input: any) => {
        if (await taskPlan.isPlanMode()) {
          return `Plan mode is active. MCP tool ${definition.name} is blocked until task_plan(action="exit") ends planning.`;
        }
        return permissionPolicy.evaluate(definition.name, input, definition.server) === 'deny'
          ? `Permission policy denied MCP server ${definition.server}. Check the active Ocean settings.`
          : undefined;
      },
      execute: async (input: Record<string, any>, options: { abortSignal?: AbortSignal; toolCallId?: string }) => {
        if (await taskPlan.isPlanMode()) {
          return { error: `Plan mode is active. MCP tool ${definition.name} is blocked until task_plan(action="exit") ends planning.` };
        }
        try {
          if (permissionPolicy.evaluate(definition.name, input, definition.server) === 'deny') {
            return { isError: true, error: `Permission policy denied MCP server ${definition.server}. Check the active Ocean settings.` };
          }
          const output = await mcpManager.callTool(definition.name, input, {
            signal: options?.abortSignal,
          });
          const serialized = JSON.stringify(output);
          if (serialized.length <= 80_000) return output;
          return {
            truncated: true,
            totalCharacters: serialized.length,
            preview: serialized.slice(0, 80_000),
          };
        } catch (error) {
          if (options?.abortSignal?.aborted) throw error;
          return { isError: true, error: (error as Error).message };
        }
      },
    };
  }
  return tools;
}

function isAllowedDuringPlan(name: string, input: any): boolean {
  if (['file_read', 'grep', 'glob', 'activate_skill'].includes(name)) return true;
  if (name !== 'local_git') return false;
  return ['status', 'log', 'diff', 'branch', 'worktree_list'].includes(input?.action);
}

/**
 * Get tool descriptions for system prompt
 */
export function getToolDescriptions(context: ToolContext) {
  const tools = getTools(context);
  return Object.values(tools).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}
