import { wildcardToRegex } from '@ocean/core';
export interface SubagentPolicy {
  toolScopes: string[][];
  maxTurns: number;
  instructions?: string;
  modelId?: string;
}
const readonlyTools = ['echo', 'local_file_read', 'local_notebook_read', 'grep', 'glob', 'ls', 'cat'];
export function policyForRun(parentRunId: string | null | undefined, metadata: unknown): SubagentPolicy | undefined {
  if (!parentRunId) return undefined;
  const value = (metadata as any)?.subagentPolicy ?? { toolScopes: [readonlyTools], maxTurns: 8 };
  if (!Array.isArray(value.toolScopes) || value.toolScopes.length < 1 || value.toolScopes.length > 4
    || value.toolScopes.some((scope: unknown) => !Array.isArray(scope) || scope.length > 128 || scope.some(pattern => typeof pattern !== 'string' || pattern.length < 1 || pattern.length > 512))
    || !Number.isSafeInteger(value.maxTurns) || value.maxTurns < 1 || value.maxTurns > 20
    || (value.instructions !== undefined && (typeof value.instructions !== 'string' || value.instructions.length > 16000))
    || (value.modelId !== undefined && (typeof value.modelId !== 'string' || value.modelId.length > 200))) throw new Error('Invalid persisted subagent policy');
  return value;
}
export function permitsSubagentTool(policy: SubagentPolicy | undefined, tool: string): boolean {
  return !policy || policy.toolScopes.every(scope => scope.some(pattern => wildcardToRegex(pattern).test(tool)));
}
export function childPolicy(agent: string, parentRunId: string | null, parentMetadata: unknown): SubagentPolicy {
  const config = JSON.parse(process.env.OCEAN_SUBAGENT_POLICIES ?? '{}');
  const selected = Object.hasOwn(config, agent) ? config[agent] : {};
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)
    || (selected.maxTurns !== undefined && (!Number.isSafeInteger(selected.maxTurns) || selected.maxTurns < 1 || selected.maxTurns > 20))) throw new Error('Invalid configured subagent policy');
  const parent = policyForRun(parentRunId, parentMetadata);
  const value: SubagentPolicy = { toolScopes: [selected.allowedTools ?? readonlyTools, ...(parent?.toolScopes ?? [])],
    maxTurns: Math.min(selected.maxTurns ?? 8, parent?.maxTurns ?? 20),
    ...(selected.instructions !== undefined ? { instructions: selected.instructions } : {}),
    ...(selected.modelId !== undefined ? { modelId: selected.modelId } : {}),
  };
  return policyForRun('child', { subagentPolicy: value })!;
}
