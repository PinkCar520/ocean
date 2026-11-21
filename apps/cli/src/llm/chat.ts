import { z } from 'zod';
import type { PermissionHookOutcome } from '@ocean/core/permission-policy';
import type { SessionStore } from '../utils/session-store.js';
import { recoveryStatePrompt } from './recovery-state.js';
import { isDeepStrictEqual } from 'node:util';
import { createDelegationTool, loadSubagents } from '../subagents/delegate.js';
import { PermissionPolicy } from '../utils/permission-policy.js';
import { LifecycleHooks } from '../utils/lifecycle-hooks.js';
import { buildEffectiveSystemPrompt } from './system-prompt.js';
import { compactContext, type Compaction, type TokenUsageSnapshot } from './compaction.js';
import { asSchema, streamText, type ModelMessage, type ToolResultPart, type ToolCallPart, stepCountIs, convertToModelMessages } from 'ai';
import type { ModelConfig } from '../types.js';
import type { LoadedSkill } from '../types.js';
import {
  type ApprovalDecision,
  type ApprovalHandler,
  type ApprovalRequest,
  hookOutcomeToApproval,
  isApproved,
  stringDecisionToApproval,
} from '../approval/types.js';

export class TurnInterruptedError extends Error {}

/** Accept both AI SDK v7 numeric usage and provider-shaped token objects. */
function usageTokenTotal(usage: any): number | undefined {
  const input = typeof usage?.inputTokens === 'number' ? usage.inputTokens : usage?.inputTokens?.total;
  const output = typeof usage?.outputTokens === 'number' ? usage.outputTokens : usage?.outputTokens?.total;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return undefined;
  return (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
}
export interface ModelUsageMetrics {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function modelUsageMetrics(usage: any): ModelUsageMetrics {
  const valid = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  return {
    inputTokens: valid(usage?.inputTokens),
    outputTokens: valid(usage?.outputTokens),
    cacheReadTokens: valid(usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens),
    cacheWriteTokens: valid(usage?.inputTokenDetails?.cacheWriteTokens),
  };
}

type HookApproval = PermissionHookOutcome & { persistUpdates?: () => Promise<void> };

/**
 * Accepts either the unified single-arg form `(request) => ApprovalDecision`
 * or the legacy `(toolName, args, context?) => string | HookApproval` form.
 * Runtime dispatch happens in normalizeApprovalHandler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyApprovalHandler = (...args: any[]) => Promise<unknown>;

export interface ApprovalGateOptions {
  /** Returns the current policy fingerprint so the gate can detect policy drift. */
  getPolicyVersion?: () => string;
  sessionId?: () => string;
  workspace?: string;
  /** Default approval timeout in ms; the handler may override it per request. */
  defaultTimeoutMs?: number;
}

/** Normalize legacy 3-arg handlers and string/hook outcomes into ApprovalDecision. */
export function normalizeApprovalHandler(handler: AnyApprovalHandler): ApprovalHandler {
  return async (request: ApprovalRequest) => {
    // New-form handlers take exactly one argument (the request object).
    // Legacy handlers take (toolName, args, context?) — arity 0, 2, or 3.
    const isNewForm = handler.length === 1;
    let result;
    if (isNewForm) {
      result = await handler(request);
    } else {
      const hasContext = request.toolCallId !== undefined || request.signal !== undefined;
      result = hasContext
        ? await handler(request.toolName, request.args, { toolCallId: request.toolCallId, signal: request.signal })
        : await handler(request.toolName, request.args);
    }
    if (typeof result === 'string') return stringDecisionToApproval(result as 'approved' | 'rejected' | 'expired' | 'cancelled');
    if (result && typeof result === 'object' && 'kind' in result) return result as ApprovalDecision;
    return hookOutcomeToApproval(result as HookApproval);
  };
}

export function applyApprovalGate(
  tools: Record<string, any>,
  approvalHandler?: AnyApprovalHandler,
  options: ApprovalGateOptions = {},
): Record<string, any> {
  const handler = approvalHandler ? normalizeApprovalHandler(approvalHandler) : undefined;
  const getPolicyVersion = options.getPolicyVersion;
  const sessionId = options.sessionId ?? (() => '');
  const workspace = options.workspace ?? process.cwd();
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 24 * 60 * 60 * 1000;

  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      const definition = tool as any;
      if (!definition.requiresApproval && !definition.beforeApproval) return [name, tool];
      const approvalRequired = (args: any): boolean => {
        if (typeof definition.requiresApproval !== 'function') {
          return definition.requiresApproval === true;
        }
        try {
          return definition.requiresApproval(args) === true;
        } catch {
          return true;
        }
      };
      const toolDefinition = { ...definition };
      delete toolDefinition.requiresApproval;
      delete toolDefinition.beforeApproval;
      return [
        name,
        {
          ...toolDefinition,
          execute: async (args: any, toolOptions: any) => {
            if (toolOptions?.abortSignal?.aborted) return { error: 'Tool execution cancelled.' };
            if (definition.beforeApproval) {
              const blocked = await definition.beforeApproval(args);
              if (blocked) return { error: blocked };
            }
            if (!approvalRequired(args)) return definition.execute(args, toolOptions);
            if (!handler) {
              return {
                type: 'text',
                text: `[审批不可用] 工具 ${name} 需要人工批准；当前会话没有审批通道，因此未执行。`,
              };
            }
            const snapshot = structuredClone(args);
            const policyVersionAtRequest = getPolicyVersion?.() ?? 'unversioned';
            const request: ApprovalRequest = {
              toolName: name,
              toolCallId: toolOptions?.toolCallId,
              args: structuredClone(snapshot),
              sessionId: sessionId(),
              workspace,
              policyVersion: policyVersionAtRequest,
              signal: toolOptions?.abortSignal,
              timeoutMs: defaultTimeoutMs,
            };
            const decision = await handler(request);
            // After the handler returns, re-verify the world has not moved
            // underneath us: signal, parameters, and policy fingerprint.
            if (toolOptions?.abortSignal?.aborted) {
              return { error: 'Approval cancelled by signal.' };
            }
            if (!isDeepStrictEqual(args, snapshot)) {
              return { error: 'Tool arguments changed; a new approval is required.' };
            }
            if (policyVersionAtRequest !== 'unversioned' && getPolicyVersion?.() !== policyVersionAtRequest) {
              return { error: 'Permission policy changed during approval; a new approval is required.' };
            }
            if (!isApproved(decision)) {
              return {
                type: 'text',
                text: `[审批拒绝] 工具 ${name} 未获批准（${decision.reason ?? decision.kind}），已取消执行。`,
              };
            }
            let approvedInput = args;
            if (decision.updatedInput !== undefined) {
              const validate = definition.inputSchema && asSchema(definition.inputSchema).validate;
              if (!validate) return { error: 'Unable to validate replacement tool input.' };
              const parsed = await validate(decision.updatedInput);
              if (!parsed.success) return { error: 'Invalid replacement tool input.' };
              approvedInput = parsed.value;
            }
            if (definition.beforeApproval) {
              const blocked = await definition.beforeApproval(approvedInput);
              if (blocked) return { error: blocked };
            }
            if (decision.updatedPermissions?.length) {
              if (!decision.persistUpdates) return { error: 'Permission updates are unavailable for this execution.' };
              try {
                await decision.persistUpdates();
              } catch (error) {
                return { error: error instanceof Error ? error.message : String(error) };
              }
              const blocked = await definition.beforeApproval?.(approvedInput);
              if (blocked) return { error: blocked };
            }
            if (toolOptions?.abortSignal?.aborted) return { error: 'Approval cancelled by signal.' };
            return definition.execute(approvedInput, toolOptions);
          },
        },
      ];
    }),
  );
}

/** Build the effective CLI system prompt from layered instructions. */
export function buildSystemPrompt(
  userId: string,
  skills: LoadedSkill[],
  workspacePath: string,
  modelId?: string,
): string {
  return buildEffectiveSystemPrompt({ userId, skills, workspacePath, modelId });
}

/**
 * Run a streaming chat with tools
 */
/**
 * 通过 Gateway Run API 执行单轮对话（第 3 条：CLI 接入统一 Run API）。
 * 使用与 Web 相同的 POST /api/chat（AI SDK data stream），由 Gateway worker
 * 完成工具循环/审批/审计，CLI 只做流式转文本。
 */
export type OceanPromptEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: unknown };

const gatewayApprovalSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  toolCallId: z.string().min(1),
});

export interface GatewayPromptOptions {
  approvalHost?: (name: string, input: Record<string, unknown>, toolCallId: string, signal?: AbortSignal) => Promise<PermissionHookOutcome>;
  gatewayUrl: string;
  apiKey: string;
  input: string;
  sessionId?: string;
  modelId?: string;
  maxTurns?: number;
  toolNames?: string[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
  nonInteractive?: boolean;
  onText?: (text: string) => void;
  onEvent?: (event: OceanPromptEvent) => void;
  signal?: AbortSignal;
}

export async function runChatLoopViaGateway(options: GatewayPromptOptions): Promise<string> {
  const base = options.gatewayUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': options.apiKey,
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: options.input }],
      stream: true,
      ...(options.nonInteractive && { nonInteractive: true }),
      ...(options.nonInteractive && options.approvalHost && { sdkApproval: true }),
      ...(options.modelId && { modelId: options.modelId }),
      ...(options.toolNames !== undefined && { toolNames: options.toolNames }),
      ...(options.maxTurns !== undefined && { maxTurns: options.maxTurns }),
      ...(options.systemPrompt !== undefined && { systemPrompt: options.systemPrompt }),
      ...(options.appendSystemPrompt !== undefined && { appendSystemPrompt: options.appendSystemPrompt }),
      ...(options.sessionId && { sessionId: options.sessionId }),
    }),
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Gateway chat failed: HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const seenApprovals = new Set<string>();
  let buffer = '';
  let fullText = '';
  let sawEvents = false;
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done && !buffer) break;
      buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('data:')) {
          sawEvents = true;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') {
            finished = true;
            continue;
          }
          const chunk: {
            type: string;
            delta?: string;
            errorText?: string;
            finishReason?: string;
            data?: OceanPromptEvent;
          } = JSON.parse(payload);
          if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
            fullText += chunk.delta;
            options.onText?.(chunk.delta);
          } else if (chunk.type === 'error') {
            throw new Error(chunk.errorText ?? 'Gateway stream failed.');
          } else if (chunk.type === 'finish') {
            if (chunk.finishReason === 'interrupted') throw new TurnInterruptedError('Gateway run was interrupted.');
            if (chunk.finishReason === 'error') throw new Error('Gateway run ended with status: error.');
            finished = true;
          } else if (chunk.type === 'data-run-approval' && chunk.data && options.nonInteractive && options.approvalHost) {
            const approval = gatewayApprovalSchema.parse(chunk.data);
            if (!seenApprovals.has(approval.id)) {
              seenApprovals.add(approval.id);
              const verdict = await options.approvalHost(approval.toolName, approval.args, approval.toolCallId, options.signal);
              options.signal?.throwIfAborted();
              const allowed = verdict.permission === 'allow' && !verdict.updatedPermissions?.length;
              const decision = await fetch(`${base}/api/runs/${encodeURIComponent(approval.runId)}/approvals/${encodeURIComponent(approval.id)}/decide`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
                body: JSON.stringify({
                  decision: allowed ? 'approved' : 'rejected', scope: 'once',
                  ...(allowed && verdict.updatedInput && { updatedInput: verdict.updatedInput }),
                  ...(verdict.permission === 'deny' && !verdict.interrupt && { continueOnDeny: true }),
                }),
                signal: options.signal,
              });
              if (!decision.ok) throw new Error(`Gateway approval failed: HTTP ${decision.status}`);
              if (verdict.permission === 'allow' && !allowed) throw new Error('Gateway could not apply the approval changes.');
            }
          } else if (chunk.type === 'data-ocean-tool' && chunk.data
            && (chunk.data.type === 'tool_call' || chunk.data.type === 'tool_result')) {
            options.onEvent?.(chunk.data);
          }
        } else if (t.startsWith('0:')) {
          let payload: string = t.slice(2);
          try {
            payload = JSON.parse(payload) as string;
          } catch {
            /* 保留原文 */
          }
          fullText += payload;
          options.onText?.(payload);
        } else if (t.startsWith('e:')) {
          throw new Error(`Gateway stream error: ${t.slice(2)}`);
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (sawEvents && !finished) throw new Error('Gateway stream disconnected before the run finished.');
  return fullText;
}

export async function runChatLoop(
  messages: ModelMessage[],
  options: {
    model: any; // AI SDK chat model
    systemPrompt: string;
    tools: Record<string, any>;
    onText?: (text: string) => void;
    journal?: { store: SessionStore; sessionId: string; workspace: string };
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any) => void;
    onUsage?: (metrics: ModelUsageMetrics) => void;
    signal?: AbortSignal;
    /** Maximum model/tool steps in one turn. */
    maxSteps?: number;
    failAtStepLimit?: boolean;
    /** Maximum output tokens per model turn. Defaults to 8192. */
    maxTokens?: number;
    delegation?: {
      workspace: string;
      permissions?: ConstructorParameters<typeof PermissionPolicy>[2];
    };
    hooks?: LifecycleHooks;
    stopHookActive?: boolean;
    compaction?: { previous?: Compaction; usage?: TokenUsageSnapshot; persist: (snapshot: Compaction) => Promise<void>; budget?: number; contextWindow?: number; outputReserve?: number; toolReserve?: number; scope?: string; onMetrics?: (metrics: import('./compaction.js').CompactionMetrics) => void };
    /**
     * 审批门（对齐 Codex/Claude：CLI 执行、对话窗口弹审批）。
     * 传入后，requiresApproval 工具执行前先调 handler，返回 approved 才放行。
     */
    approvalHandler?: AnyApprovalHandler;
    /** Policy/session context forwarded to applyApprovalGate. */
    approvalOptions?: ApprovalGateOptions;
  },
): Promise<{
  text: string;
  toolCalls: ToolCallPart[];
  toolResults: ToolResultPart[];
  responseMessages: ModelMessage[];
  /** Provider usage for the saved transcript; estimate only messages appended later. */
  usage?: TokenUsageSnapshot;
}> {
  if (options.approvalHandler) {
    const original = options.approvalHandler;
    const normalized = normalizeApprovalHandler(original);
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    options = {
      ...options,
      signal,
      approvalHandler: async (request: ApprovalRequest) => {
        const verdict = await normalized({ ...request, signal });
        if (verdict.interrupt) {
          controller.abort(new TurnInterruptedError(verdict.reason || 'Permission hook interrupted the turn.'));
          signal.throwIfAborted();
        }
        return verdict;
      },
    };
  }
  options.signal?.throwIfAborted();
  const maxSteps = options.maxSteps ?? 30;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error('Invalid model step limit');
  const inputMessageCount = messages.length;
  let fullText = '';
  const toolCalls: ToolCallPart[] = [];
  const toolResults: ToolResultPart[] = [];

  const promptHook = !options.stopHookActive && await options.hooks?.run('UserPromptSubmit', { prompt: messages.at(-1)?.content }, options.signal);
  if (promptHook && promptHook.blocked) throw new Error(promptHook.reason);
  const activationMessages: ModelMessage[] = [];
  const last = messages.at(-1);
  const explicit = !options.stopHookActive && last?.role === 'user' && typeof last.content === 'string' ? last.content.match(/^\/([\w-]+)(?:\s|$)/)?.[1] : undefined;
  if (explicit && options.tools.activate_skill) {
    const activated = await applyApprovalGate({ activate_skill: options.tools.activate_skill }, options.approvalHandler, options.approvalOptions).activate_skill.execute({ skill_name: explicit }, { abortSignal: options.signal });
    if (activated?.instructions) activationMessages.push({ role: 'user', content: `[Activated Skill: ${explicit}]\n${activated.instructions}\nResource directory: ${activated.sourcePath}` });
  }
  messages = [...messages, ...activationMessages];
  if (options.delegation) {
    const definitions = loadSubagents(options.delegation.workspace);
    if (definitions.length) {
      const permissions = new PermissionPolicy(options.delegation.workspace, undefined, options.delegation.permissions);
      const delegate = createDelegationTool(definitions, {
        model: options.model, tools: options.tools, systemPrompt: options.systemPrompt,
        persistence: options.journal,
        signal: options.signal, approvalHandler: options.approvalHandler, run: runChatLoop, history: messages,
      });
      options = {
        ...options,
        tools: {
          ...options.tools,
          delegate_task: {
            ...delegate,
            requiresApproval: (input: Record<string, unknown>) => permissions.evaluate('delegate_task', input) === 'ask',
            beforeApproval: (input: Record<string, unknown>) => permissions.evaluate('delegate_task', input) === 'deny'
              ? 'Permission denied for subagent delegation.'
              : undefined,
          },
        },
      };
    }
  }
  let toolExecutionObserved = false;
  const guardedTools = Object.fromEntries(Object.entries(options.tools).map(([name, definition]) => [name, {
    ...definition,
    ...(typeof definition.execute === 'function' ? { execute: async (...args: any[]) => {
      options.signal?.throwIfAborted();
      const input = { tool_name: name, tool_input: args[0], tool_use_id: args[1]?.toolCallId };
      const pre = await options.hooks?.run('PreToolUse', input, options.signal);
      if (pre?.blocked) return { error: pre.reason };
      options.signal?.throwIfAborted();
      // Record entry into the executable tool path before awaiting any effect.
      // A provider may omit tool-call chunks even when it executes a tool.
      toolExecutionObserved = true;
      let output;
      try { output = options.journal
        ? await options.journal.store.executeToolCall(options.journal.sessionId, options.journal.workspace, args[1]?.toolCallId, name, args[0], () => definition.execute(...args))
        : await definition.execute(...args);
      } catch (error) {
        await options.hooks?.run('ToolUseFailure', { ...input, error: String(error) }, options.signal);
        throw error;
      }
      const post = await options.hooks?.run('PostToolUse', { ...input, tool_response: output }, options.signal);
      if (post?.blocked) return { result: output, hookFeedback: post.reason };
      return output;
    } } : {}),
  }]));
  const tools = applyApprovalGate(guardedTools, options.approvalHandler, {
    ...options.approvalOptions,
    sessionId: options.journal ? () => options.journal!.sessionId : options.approvalOptions?.sessionId,
    workspace: options.journal?.workspace ?? options.approvalOptions?.workspace,
  });

  // Recover structured execution metadata from durable session storage before
  // deciding what historical messages to compact. This state is not a summary
  // and does not rely on model recall.
  const persistedState = options.journal
    ? recoveryStatePrompt(await options.journal.store.load(options.journal.sessionId, options.journal.workspace))
    : '';
  // Skill activation is derived from the durable transcript, not from the
  // compacted model view; include it in both the request and token budget.
  const effectiveSystemPrompt = options.systemPrompt + persistedState + activeSkillInstructions(messages);
  const compactionOptions = options.compaction;
  let initialSnapshot = compactionOptions?.previous;
  const context = compactionOptions ? await compactContext(messages, {
    model: options.model, systemPrompt: effectiveSystemPrompt, signal: options.signal,
    scope: options.journal?.sessionId,
    ...compactionOptions,
    persist: async (snapshot) => { initialSnapshot = snapshot; await compactionOptions.persist(snapshot); },
  }) : messages;
  const compaction = compactionOptions;
  let carried: ModelMessage[] = context;
  let fullTranscript: ModelMessage[] = [...messages];
  let midTurnSnapshot: Compaction | undefined = initialSnapshot;
  let lastStepTotalTokens: number | undefined;
  const prepareStep = compaction ? async ({ stepNumber, messages: stepMessages }: { stepNumber: number; messages: ModelMessage[] }) => {
    if (stepNumber === 0) return undefined;
    options.signal?.throwIfAborted();
    // Rebuild the durable transcript by appending only the messages the model
    // layer added since the last prepared step. If the provider diverged from
    // our carried prefix, fall back to an ephemeral compaction that cannot
    // corrupt the session snapshot.
    const prefixMatches = stepMessages.length >= carried.length && carried.every((message, index) => isDeepStrictEqual(stepMessages[index], message));
    const complete = prefixMatches ? [...fullTranscript, ...stepMessages.slice(carried.length)] : stepMessages;
    // Usage maps to the request prefix only while `carried` still starts the
    // durable transcript; after a compacted prefix it would under-count.
    const usageApplies = lastStepTotalTokens !== undefined && prefixMatches
      && fullTranscript.length >= carried.length
      && carried.every((message, index) => isDeepStrictEqual(fullTranscript[index], message));
    const usage = usageApplies ? { totalTokens: lastStepTotalTokens!, messageCount: Math.min(complete.length, carried.length + 1) } : undefined;
    let nextSnapshot: Compaction | undefined;
    const scopeBase = compaction.scope ?? options.journal?.sessionId ?? 'default';
    const compacted = await compactContext(complete, {
      model: options.model,
      systemPrompt: effectiveSystemPrompt,
      signal: options.signal,
      budget: compaction.budget,
      contextWindow: compaction.contextWindow,
      outputReserve: compaction.outputReserve,
      toolReserve: compaction.toolReserve,
      scope: `${scopeBase}:mid-turn`,
      boundary: 'any',
      usage,
      previous: prefixMatches ? midTurnSnapshot : undefined,
      onMetrics: compaction.onMetrics,
      persist: prefixMatches
        ? async (snapshot) => { nextSnapshot = snapshot; await compaction.persist(snapshot); }
        : async () => undefined,
    });
    if (prefixMatches) {
      fullTranscript = complete;
      if (nextSnapshot) midTurnSnapshot = nextSnapshot;
    }
    carried = compacted;
    return isDeepStrictEqual(compacted, stepMessages) ? undefined : { messages: compacted };
  } : undefined;
  const maxTokens = options.maxTokens ?? 8192;

  /** Errors that may succeed on a second attempt (truncated JSON, transient network). */
  function isRetryableStreamError(error: unknown): boolean {
    if (error instanceof TurnInterruptedError) return false;
    if (error instanceof Error) {
      const msg = error.message;
      if (msg.includes('aborted') || msg.includes('cancelled')) return false;
      if (msg.includes('Unterminated') || msg.includes('JSON at position')) return true;
      if (msg.includes('finishReason: other') || msg.includes('finishReason: error')) return true;
      if (msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) return true;
      if (msg.includes('Model stream incomplete')) return true;
    }
    return false;
  }

  const MAX_STREAM_RETRIES = 1;
  let finalResult: any;
  let text = '';

  for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
    let streamError: Error | undefined;
    let sawToolActivity = false;
    // Do not retry a failed request after any prior attempt executed a tool.
    // The marker intentionally survives across attempts.
    fullText = '';
    toolCalls.length = 0;
    toolResults.length = 0;
    lastStepTotalTokens = undefined;

    const result = streamText({
      model: options.model,
      messages: context,
      system: effectiveSystemPrompt,
      tools,
      toolChoice: 'auto',
      maxOutputTokens: maxTokens,
      stopWhen: stepCountIs(maxSteps),
      prepareStep,
      abortSignal: options.signal,
      maxRetries: 3,
      onError: ({ error }) => {
        streamError = error instanceof Error ? error : new Error(String(error));
      },
      onChunk: ({ chunk }) => {
        if (options.signal?.aborted) return;
        if (chunk.type === 'text-delta') {
          fullText += chunk.text;
          options.onText?.(chunk.text);
        } else if (chunk.type === 'tool-call') {
          sawToolActivity = true;
          options.onToolCall?.(chunk.toolName, chunk.input);
        }
      },
      onStepFinish: ({ toolCalls: stepToolCalls, toolResults: stepToolResults, usage }) => {
        if (stepToolCalls?.length || stepToolResults?.length) sawToolActivity = true;
        lastStepTotalTokens = usageTokenTotal(usage);
        try { options.onUsage?.(modelUsageMetrics(usage)); } catch { /* telemetry is non-critical */ }
        if (stepToolCalls) {
          toolCalls.push(...(stepToolCalls as ToolCallPart[]));
        }
        if (stepToolResults) {
          for (const tr of stepToolResults as ToolResultPart[]) {
            toolResults.push(tr);
            options.onToolResult?.(tr.toolName, tr.output);
          }
        }
      },
    });

    try {
      finalResult = await result;
      text = await Promise.resolve(finalResult.text).catch((error) => {
        options.signal?.throwIfAborted();
        throw error;
      });
      options.signal?.throwIfAborted();
      const finishReason = await finalResult.finishReason;
      if (options.failAtStepLimit && finishReason === 'tool-calls') {
        throw new Error(`Maximum model turns reached: ${maxSteps}.`);
      }
      if (finishReason === 'error' || finishReason === 'other') {
        const detail = streamError ? ` ${streamError.message}` : '';
        throw new Error(`Model stream incomplete (finishReason: ${finishReason}).${detail}`);
      }
      break; // success
    } catch (error) {
      options.signal?.throwIfAborted();
      // A model retry must never replay a tool side effect. The journal
      // protects stable toolCallIds, but a fresh stream can generate new IDs.
      if (attempt < MAX_STREAM_RETRIES && !toolExecutionObserved && !sawToolActivity && toolCalls.length === 0 &&
          toolResults.length === 0 && isRetryableStreamError(error)) {
        continue;
      }
      throw error;
    }
  }

  options.signal?.throwIfAborted();

  const responseMessages = (await finalResult.responseMessages) as ModelMessage[];
  const stop = await options.hooks?.run('Stop', { stop_hook_active: options.stopHookActive ?? false, last_assistant_message: text }, options.signal);
  if (stop?.blocked) {
    if (options.stopHookActive) throw new Error('Stop hook blocked twice; continuation limit reached');
    const feedback: ModelMessage = { role: 'user', content: `Stop hook feedback: ${stop.reason}` };
    const remaining = options.failAtStepLimit ? maxSteps - (await finalResult.steps).length : options.maxSteps;
    if (remaining !== undefined && remaining < 1) throw new Error(`Maximum model turns reached: ${maxSteps}.`);
    const continued = await runChatLoop([...messages, ...responseMessages, feedback], {
      ...options, maxSteps: remaining, stopHookActive: true,
    });
    return { ...continued, toolCalls: [...toolCalls, ...continued.toolCalls], toolResults: [...toolResults, ...continued.toolResults], responseMessages: [...responseMessages, feedback, ...continued.responseMessages] };
  }
  return {
    text: text || fullText,
    toolCalls,
    toolResults,
    // Keep the model/tool transcript so later turns can see which tools ran and what they returned.
    responseMessages: [...activationMessages, ...responseMessages],
    usage: lastStepTotalTokens !== undefined
      ? { totalTokens: lastStepTotalTokens, messageCount: inputMessageCount + activationMessages.length + responseMessages.length }
      : undefined,
  };
}

/**
 * Activate a skill and get its content
 */
export function activateSkill(skills: LoadedSkill[], skillName: string): { message: string; content: string } | null {
  const skill = skills.find(s => s.manifest.name === skillName);
  if (!skill) {
    return null;
  }

  return {
    message: `Skill "${skillName}" has been successfully activated. Instructions are provided below. Please follow them strictly for all subsequent steps in this task.`,
    content: skill.content,
  };
}

/** Restore activated instructions from the original transcript, even after compaction. */
export function activeSkillInstructions(messages: ModelMessage[]): string {
  const active = new Map<string, string>();
  for (const message of messages) {
    if (message.role === 'user' && typeof message.content === 'string' && message.content.startsWith('[Activated Skill: ')) active.set(message.content.split(']')[0], message.content);
    if (message.role !== 'tool' || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type !== 'tool-result' || part.toolName !== 'activate_skill') continue;
      const output = part.output as any;
      const value = output?.value ?? output;
      if (value && typeof value.skill === 'string' && typeof value.instructions === 'string') active.set(value.skill, `[Activated Skill: ${value.skill}]\n${value.instructions}\nResource directory: ${value.sourcePath}`);
    }
  }
  return active.size ? '\nActivated skill guidance (subject to user instructions and tool permissions):\n' + [...active.values()].join('\n') : '';
}
