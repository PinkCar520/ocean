import { SecurityAuditResult } from '../utils/security.js';

/**
 * Standard interface for all local tools.
 */
export interface LocalToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  uiHint?: 'text' | 'code' | 'diff' | 'tree' | 'git';
  audit?: SecurityAuditResult;
}

export abstract class LocalTool<P = any, R = any> {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Executes the tool logic.
   */
  abstract execute(params: P): Promise<LocalToolResponse<R>>;
}

import type { ToolContext } from '../types.js';

export interface ToolExecutionContext extends ToolContext {
  workspaceRoot: string;
}
export type ToolErrorCode = 'validation' | 'execution' | 'cancelled';

/** Shared boundary for SDK and RPC adapters; successful payloads stay wire compatible. */
export async function executeTool(
  tool: { name?: string; inputSchema?: { parseAsync(input: unknown): Promise<any> }; execute: (input: any, context: ToolExecutionContext) => Promise<any> },
  input: unknown,
  context: ToolContext,
): Promise<any> {
  const ctx: ToolExecutionContext = { ...context, workspaceRoot: context.cwd };
  const failure = (error: unknown, errorCode: ToolErrorCode) => ({ data: null, error: error instanceof Error ? error.message : String(error), errorCode });
  if (ctx.signal?.aborted) return failure(ctx.signal.reason ?? 'Tool execution cancelled.', 'cancelled');
  let parsed;
  try { parsed = tool.inputSchema ? await tool.inputSchema.parseAsync(input) : input; }
  catch (error) { return failure(error, 'validation'); }
  try {
    if (ctx.signal?.aborted) return failure(ctx.signal.reason ?? 'Tool execution cancelled.', 'cancelled');
    const result = await tool.execute(parsed, ctx);
    if (ctx.signal?.aborted) return failure(ctx.signal.reason ?? 'Tool execution cancelled.', 'cancelled');
    return result?.error ? { ...result, errorCode: result.errorCode ?? 'execution' } : result;
  } catch (error) { return failure(error, ctx.signal?.aborted ? 'cancelled' : 'execution'); }
}
