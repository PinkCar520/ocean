import type { SessionStore } from '../utils/session-store.js';
import { isDeepStrictEqual } from 'node:util';
import { createDelegationTool, loadSubagents } from '../subagents/delegate.js';
import { PermissionPolicy } from '../utils/permission-policy.js';
import { LifecycleHooks } from '../utils/lifecycle-hooks.js';
import { buildEffectiveSystemPrompt } from './system-prompt.js';
import { compactContext, type Compaction, type TokenUsageSnapshot } from './compaction.js';
import { streamText, type ModelMessage, type ToolResultPart, type ToolCallPart, stepCountIs, convertToModelMessages } from 'ai';
import type { ModelConfig } from '../types.js';
import type { LoadedSkill } from '../types.js';

type ApprovalDecision = 'approved' | 'rejected' | 'expired';

/** Accept both AI SDK v7 numeric usage and provider-shaped token objects. */
function usageTokenTotal(usage: any): number | undefined {
  const input = typeof usage?.inputTokens === 'number' ? usage.inputTokens : usage?.inputTokens?.total;
  const output = typeof usage?.outputTokens === 'number' ? usage.outputTokens : usage?.outputTokens?.total;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return undefined;
  return (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
}
type ToolApprovalHandler = (
  toolName: string,
  args: any,
  context?: { toolCallId?: string; signal?: AbortSignal },
) => Promise<ApprovalDecision>;

export function applyApprovalGate(
  tools: Record<string, any>,
  approvalHandler?: ToolApprovalHandler,
): Record<string, any> {
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
            if (!approvalHandler) {
              return {
                type: 'text',
                text: `[审批不可用] 工具 ${name} 需要人工批准；当前会话没有审批通道，因此未执行。`,
              };
            }
            const snapshot = structuredClone(args);
            const deadline = Date.now() + 5 * 60_000;
            const context = toolOptions?.toolCallId || toolOptions?.abortSignal
              ? { toolCallId: toolOptions?.toolCallId, signal: toolOptions?.abortSignal }
              : undefined;
            const decision = context
              ? await approvalHandler(name, structuredClone(snapshot), context)
              : await approvalHandler(name, structuredClone(snapshot));
            if (toolOptions?.abortSignal?.aborted || Date.now() >= deadline) return { error: 'Approval cancelled or expired.' };
            if (!isDeepStrictEqual(args, snapshot)) return { error: 'Tool arguments changed; a new approval is required.' };
            if (definition.beforeApproval) {
              const blocked = await definition.beforeApproval(args);
              if (blocked) return { error: blocked };
            }
            if (decision !== 'approved') {
              return {
                type: 'text',
                text: `[审批拒绝] 工具 ${name} 未获批准（${decision}），已取消执行。`,
              };
            }
            return definition.execute(args, toolOptions);
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

export interface GatewayPromptOptions {
  gatewayUrl: string;
  apiKey: string;
  input: string;
  sessionId?: string;
  modelId?: string;
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
      ...(options.modelId && { modelId: options.modelId }),
      ...(options.sessionId && { sessionId: options.sessionId }),
    }),
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Gateway chat failed: HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
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
            if (['error', 'interrupted'].includes(chunk.finishReason ?? '')) {
              throw new Error(`Gateway run ended with status: ${chunk.finishReason}`);
            }
            finished = true;
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
    signal?: AbortSignal;
    /** Maximum model/tool steps in one turn. */
    maxSteps?: number;
    delegation?: {
      workspace: string;
      permissions?: ConstructorParameters<typeof PermissionPolicy>[2];
    };
    hooks?: LifecycleHooks;
    stopHookActive?: boolean;
    compaction?: { previous?: Compaction; usage?: TokenUsageSnapshot; persist: (snapshot: Compaction) => Promise<void>; budget?: number; contextWindow?: number; outputReserve?: number; toolReserve?: number; scope?: string };
    /**
     * 审批门（对齐 Codex/Claude：CLI 执行、对话窗口弹审批）。
     * 传入后，requiresApproval 工具执行前先调 handler，返回 'approved' 才放行。
     */
    approvalHandler?: ToolApprovalHandler;
  },
): Promise<{
  text: string;
  toolCalls: ToolCallPart[];
  toolResults: ToolResultPart[];
  responseMessages: ModelMessage[];
  /** Provider usage for the saved transcript; estimate only messages appended later. */
  usage?: TokenUsageSnapshot;
}> {
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
    const activated = await applyApprovalGate({ activate_skill: options.tools.activate_skill }, options.approvalHandler).activate_skill.execute({ skill_name: explicit }, { abortSignal: options.signal });
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
  const guardedTools = Object.fromEntries(Object.entries(options.tools).map(([name, definition]) => [name, {
    ...definition,
    ...(typeof definition.execute === 'function' ? { execute: async (...args: any[]) => {
      options.signal?.throwIfAborted();
      const input = { tool_name: name, tool_input: args[0], tool_use_id: args[1]?.toolCallId };
      const pre = await options.hooks?.run('PreToolUse', input, options.signal);
      if (pre?.blocked) return { error: pre.reason };
      options.signal?.throwIfAborted();
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
  const tools = applyApprovalGate(guardedTools, options.approvalHandler);

  const compactionOptions = options.compaction;
  let initialSnapshot = compactionOptions?.previous;
  const context = compactionOptions ? await compactContext(messages, {
    model: options.model, systemPrompt: options.systemPrompt, signal: options.signal,
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
      systemPrompt: options.systemPrompt,
      signal: options.signal,
      budget: compaction.budget,
      contextWindow: compaction.contextWindow,
      outputReserve: compaction.outputReserve,
      toolReserve: compaction.toolReserve,
      scope: `${scopeBase}:mid-turn`,
      boundary: 'any',
      usage,
      previous: prefixMatches ? midTurnSnapshot : undefined,
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
  const result = streamText({
    model: options.model,
    messages: context,
    system: options.systemPrompt + activeSkillInstructions(messages),
    tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(maxSteps),
    prepareStep,
    abortSignal: options.signal,
    onChunk: ({ chunk }) => {
      if (options.signal?.aborted) return;
      if (chunk.type === 'text-delta') {
        fullText += chunk.text;
        options.onText?.(chunk.text);
      } else if (chunk.type === 'tool-call') {
        options.onToolCall?.(chunk.toolName, chunk.input);
      }
    },
    onStepFinish: ({ toolCalls: stepToolCalls, toolResults: stepToolResults, usage }) => {
      lastStepTotalTokens = usageTokenTotal(usage);
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

  // Consume the stream
  const finalResult = await result;
  const text = await finalResult.text;
  const finishReason = await finalResult.finishReason;
  if (finishReason === 'error' || finishReason === 'other') {
    throw new Error('Model stream incomplete; turn was not completed.');
  }
  options.signal?.throwIfAborted();

  const responseMessages = (await finalResult.responseMessages) as ModelMessage[];
  const stop = await options.hooks?.run('Stop', { stop_hook_active: options.stopHookActive ?? false, last_assistant_message: text }, options.signal);
  if (stop?.blocked) {
    if (options.stopHookActive) throw new Error('Stop hook blocked twice; continuation limit reached');
    const feedback: ModelMessage = { role: 'user', content: `Stop hook feedback: ${stop.reason}` };
    const continued = await runChatLoop([...messages, ...responseMessages, feedback], { ...options, stopHookActive: true });
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
