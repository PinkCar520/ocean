import { Injectable, Logger, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { streamText, generateText, stepCountIs } from 'ai';
import { MCPClientManager } from '../mcp/mcp-client.manager';
import { SkillLoader } from './skill.loader';
import { PermissionService } from './permission.service';
import { RpcGateway } from '../chat/rpc.gateway';
import { SessionService } from '../session/session.service';
import { InteractiveManager } from './interactive.manager';
import { TracingService } from '../tracing/tracing.service';
import { RAGService } from '../rag/rag.service';
import { ZentaoService } from '../zentao/zentao.service';
import type { SkillContext } from '@ocean/core';
import { ModelRegistry } from '../runtime/model.registry';
import { PromptComposer } from '../runtime/prompt.composer';
import { ContextAssembler } from '../runtime/context.assembler';
import { ToolRuntime } from '../runtime/tool.runtime';
import { PolicyEvaluator } from '../runtime/policy.evaluator';
import { SkillResolver } from '../runtime/skill.resolver';

/**
 * SkillOrchestrator
 *
 * Implements the AgentSkills client-side protocol for Ocean Gateway.
 * 自 Agent Runtime 拆分后（第 2 项），本类收敛为纯编排：模型解析、
 * Prompt 组装、上下文装配、工具装配、策略判定、技能解析全部委托
 * ModelRegistry / PromptComposer / ContextAssembler / ToolRuntime /
 * PolicyEvaluator / SkillResolver 六个独立模块。
 */

/** 技能生成默认 System Prompt（原 FastAPI skills.py 迁移）。 */
const DEFAULT_SKILL_CREATOR_PROMPT = `You are an expert AI Assistant specialized in writing high-quality Skill Prompts for other AI agents.
The user will give you a brief instruction on what they want the skill to do.
You need to generate:
1. 'name': A short, descriptive name (max 3 words).
2. 'description': A brief explanation of what the skill does.
3. 'content': The detailed system prompt for this skill. It should be well-structured, clear, and comprehensive. Use markdown. You can define variables like {{variable_name}} if the skill needs dynamic context.
4. 'triggerKws': A list of 2-5 keyword strings that would trigger this skill based on user queries.

Return the result strictly as a valid JSON object. No markdown code blocks, just raw JSON.
Example:
{
  "name": "PR Reviewer",
  "description": "Reviews pull requests for code quality",
  "content": "You are a senior engineer. Review the provided code...",
  "triggerKws": ["review", "pr", "pull request", "code check"]
}`;
@Injectable()
export class SkillOrchestrator {
  private readonly logger = new Logger(SkillOrchestrator.name);

  constructor(
    private configService: ConfigService,
    private mcpManager: MCPClientManager,
    private skillLoader: SkillLoader,
    private permissionService: PermissionService,
    private rpcGateway: RpcGateway,
    private sessionService: SessionService,
    private interactiveManager: InteractiveManager,
    private tracingService: TracingService,
    private ragService: RAGService,
    private zentaoService: ZentaoService,
    private modelRegistry: ModelRegistry,
    private promptComposer: PromptComposer,
    private contextAssembler: ContextAssembler,
    private toolRuntime: ToolRuntime,
    private policyEvaluator: PolicyEvaluator,
    private skillResolver: SkillResolver,
    @Inject('PRISMA_CLIENT') private prisma: any,
  ) { }

  /** 获取当前网关配置的模型列表（委托 ModelRegistry）。 */
  getAvailableModels() {
    return this.modelRegistry.getAvailableModels();
  }

  // ──────────────────────────────────────────────
  // Step 2 + 3: System Prompt（委托 PromptComposer / SkillResolver）
  // ──────────────────────────────────────────────
  private buildSystemPrompt(ctx: SkillContext, sessionId?: string): Promise<string> {
    return this.promptComposer.buildSystemPrompt(ctx, sessionId);
  }

  /**
   * 从自然语言描述生成技能（第 4 条本地化：不再代理 FastAPI）。
   * 读取 SystemConfig('skill_creator_prompt') 作为 system prompt（缺省写入），
   * 直调配置的 LLM provider（OpenAI 兼容 /chat/completions，JSON 模式）。
   */
  async generateSkill(instruction: string): Promise<any> {
    let config = await this.prisma.systemConfig.findUnique({
      where: { key: 'skill_creator_prompt' },
    });
    if (!config) {
      config = await this.prisma.systemConfig.create({
        data: {
          key: 'skill_creator_prompt',
          value: DEFAULT_SKILL_CREATOR_PROMPT,
          description: 'Default system prompt for the AI Skill Creator feature.',
        },
      });
    }

    const provider = (
      this.configService.get<string>('DEFAULT_AI_PROVIDER') || 'openai'
    ).toUpperCase();
    const apiKey =
      this.configService.get<string>(`${provider}_API_KEY`) ||
      this.configService.get<string>('OPENAI_API_KEY');
    const baseUrl =
      this.configService.get<string>(`${provider}_BASE_URL`) ||
      this.configService.get<string>('OPENAI_BASE_URL');
    const model =
      this.configService.get<string>(`${provider}_MODEL`) ||
      this.configService.get<string>('OPENAI_MODEL') ||
      'gpt-4o';

    if (!apiKey) {
      throw new Error('LLM API key not configured for skill generation');
    }

    const res = await globalThis.fetch(
      `${(baseUrl || '').replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: config.value },
            { role: 'user', content: instruction },
          ],
          response_format: { type: 'json_object' },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`LLM responded with status: ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const resultText = data.choices?.[0]?.message?.content ?? '';
    try {
      const parsed = JSON.parse(resultText) as {
        name?: string;
        description?: string;
        content?: string;
        triggerKws?: string[];
      };
      return {
        name: parsed.name ?? 'New Skill',
        description: parsed.description ?? '',
        content: parsed.content ?? '',
        triggerKws: parsed.triggerKws ?? [],
      };
    } catch {
      // Fallback if json is malformed
      return {
        name: 'Generated Skill',
        description: '',
        content: resultText,
        triggerKws: [],
      };
    }
  }

  // ──────────────────────────────────────────────
  // Tools: Atomic Local Tools + MCP + activate_skill（委托 ToolRuntime / PolicyEvaluator）
  // ──────────────────────────────────────────────
  private buildTools(ctx: SkillContext, sessionId?: string): Promise<Record<string, any>> {
    return this.toolRuntime.buildTools(ctx, sessionId);
  }



  async streamResponse(messages: any[], ctx: SkillContext, modelId?: string, sessionId?: string, onChunk?: (chunk: string) => void): Promise<void> {
    const isSearchMode = (ctx as any).search === true;
    const isKnowledgeMode = (ctx as any).knowledge === true;

    return await this.tracingService.traceCall('streamResponse', {
      sessionId,
      userId: ctx.userId,
      isSearch: isSearchMode,
      isKnowledge: isKnowledgeMode
    }, async (span) => {
      try {
        this.logger.log(`[Orchestrator] streamResponse session=${sessionId} messages=${messages?.length}`);

        let newUserMsgId: string | undefined;

        if (sessionId && Array.isArray(messages)) {
          const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
          if (lastUserMsg) {
            const userContent = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';
            newUserMsgId = await this.sessionService.addMessage(sessionId, {
              role: 'user',
              content: userContent,
              parentId: (lastUserMsg as any).parentId,
              parts: lastUserMsg.parts,
              attachments: lastUserMsg.experimental_attachments,
            });
          }
        }

        // Robustly ensure messages have parts for the SDK（委托 ContextAssembler）
        const sanitizedMessages = this.contextAssembler.sanitizeMessages(messages || []);

        // --- RAG Context Injection（委托 ContextAssembler）---
        if (isSearchMode || isKnowledgeMode) {
          const { injected } = await this.contextAssembler.injectRagContext(
            sanitizedMessages,
            ctx,
            isSearchMode ? 'search' : 'knowledge',
          );
          span.setAttribute('rag_context_injected', injected);
        }

        const modelMessages = await this.contextAssembler.toModelMessages(sanitizedMessages);
        const [systemPrompt, tools] = await Promise.all([this.buildSystemPrompt(ctx, sessionId), this.buildTools(ctx, sessionId)]);

        const allParts: any[] = [];
        let fullText = '';

        let dbPromiseResolve: () => void;
        const dbPromise = new Promise<void>((resolve) => {
          dbPromiseResolve = resolve;
        });

        const result = streamText({
          model: this.modelRegistry.getModel(modelId),
          messages: modelMessages,
          toolChoice: 'auto',
          stopWhen: stepCountIs(10),
          system: systemPrompt,
          tools,
          onStepFinish: (event) => {
            const { text, toolCalls, toolResults } = event;

            // 1. 记录文本
            if (text) {
              fullText += text;
              allParts.push({ type: 'text', text });
            }

            // 2. 闭环审计逻辑：确保每一个 toolCall 都有对应的结果进入 allParts
            const handledCallIds = new Set<string>();

            // 先处理已经有真实结果的调用
            if (toolResults && Array.isArray(toolResults)) {
              for (const tr of toolResults) {
                const part = {
                  type: 'tool-invocation',
                  toolCallId: tr.toolCallId,
                  toolName: tr.toolName,
                  args: tr.input,
                  result: tr.output
                };
                allParts.push(part);
                handledCallIds.add(tr.toolCallId);
              }
            }

            // 补全审计：如果某些 toolCalls 丢失了结果（如异常中断），补全占位符防止 SDK 报错
            if (toolCalls && Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                if (!handledCallIds.has(tc.toolCallId)) {
                  this.logger.warn(`[Orchestrator] Missing result for tool call ${tc.toolCallId} (${tc.toolName}). Injecting placeholder.`);
                  allParts.push({
                    type: 'tool-invocation',
                    toolCallId: tc.toolCallId,
                    toolName: tc.toolName,
                    args: (tc as any).args,
                    result: { error: 'Execution was interrupted or failed to return a valid result.' }
                  });
                }
              }
            }
          },
          onFinish: async ({ totalUsage }: any) => {
            if (totalUsage) {
              span.setAttribute('total_tokens', totalUsage.totalTokens || 0);
              span.setAttribute('prompt_tokens', totalUsage.inputTokens || 0);
              span.setAttribute('completion_tokens', totalUsage.outputTokens || 0);
            }

            // 修改持久化逻辑：只要有文本或者有工具调用记录 (allParts)，就必须保存
            if (sessionId && (fullText || allParts.length > 0)) {
              try {
                const usage = totalUsage ? {
                  inputTokens: totalUsage.inputTokens ?? 0,
                  outputTokens: totalUsage.outputTokens ?? 0,
                  totalTokens: totalUsage.totalTokens ?? 0
                } : undefined;

                await this.sessionService.addMessage(sessionId, {
                  role: 'assistant',
                  content: fullText || '', // 允许内容为空，只要 parts 有数据
                  parentId: newUserMsgId, // 指向刚创建的 User 消息
                  parts: allParts,
                  usage
                });
                this.logger.log(`[Orchestrator] Persisted assistant reply. Parts count: ${allParts.length}`);
              } catch (dbErr: any) {
                this.logger.error(`[Orchestrator] Failed to persist message: ${dbErr.message}`);
              }
            }
            dbPromiseResolve();
          },
        });

        const consumeStream = async () => {
          let isFirstReasoning = true;
          let hasReasoning = false;
          const fullStream = result.fullStream;
          for await (const chunk of fullStream) {
            let protocolStr = '';
            if (chunk.type === 'text-delta') {
              let text = chunk.text;
              if (hasReasoning && isFirstReasoning === false) {
                // Close the think tag before the first text chunk
                text = '\n</think>\n\n' + text;
                hasReasoning = false; // Prevents closing again
              }
              protocolStr = `0:${JSON.stringify(text)}\n`;
            } else if (chunk.type === 'reasoning-delta') {
              let text = chunk.text;
              if (isFirstReasoning) {
                text = '<think>\n' + text;
                isFirstReasoning = false;
                hasReasoning = true;
              }
              protocolStr = `0:${JSON.stringify(text)}\n`;
            } else if (chunk.type === 'tool-call') {
              // Include tool calls into the data stream (using standard data stream protocol if needed, though useChat natively handles some tool streaming)
              protocolStr = `9:${JSON.stringify({ ...chunk })}\n`;
            }
            if (protocolStr && onChunk) onChunk(protocolStr);
          }
          
          // If the stream ended but reasoning was never closed (shouldn't happen usually, but just in case)
          if (hasReasoning && isFirstReasoning === false) {
            if (onChunk) onChunk(`0:${JSON.stringify('\n</think>\n')}\n`);
          }

          // [Official Practice] Emit the finish event to properly terminate Vercel AI SDK stream
          if (onChunk) {
            onChunk(`d:${JSON.stringify({ finishReason: 'stop' })}\n`);
          }
        };

        await Promise.all([consumeStream(), dbPromise]);
      } catch (err: any) {
        this.logger.error(`Stream error: ${err.message}`);
        span.recordException(err);
        if (err.stack) this.logger.error(err.stack);
        throw err;
      }
    });
  }

  async textResponse(userId: string, content: string, source: 'im' | 'cli' = 'im'): Promise<string> {
    try {
      const ctx: SkillContext = { userId, source, userMessage: content };
      const [systemPrompt, tools] = await Promise.all([this.buildSystemPrompt(ctx), this.buildTools(ctx)]);
      const { text } = await generateText({ model: this.modelRegistry.getModel(), messages: [{ role: 'user', content }], system: systemPrompt, tools, stopWhen: stepCountIs(10) });
      return text;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }

  /**
   * 为会话生成简短摘要标题
   */
  async generateTitle(userContent: string, modelId?: string): Promise<string> {
    try {
      const { text } = await generateText({
        model: this.modelRegistry.getModel(modelId),
        system: '你是一个标题生成助手。总结一个 5 字以内的中文标题，不要标点符号。直接返回文字。',
        messages: [{ role: 'user', content: userContent }],
      });
      return text.trim().replace(/[。？！，、]/g, '');
    } catch (err: any) {
      this.logger.error(`Generate title error: ${err?.message || String(err)}`);
      return userContent.slice(0, 15);
    }
  }

  /**
   * AI 智能补全 (Ghost Text)
   * 基于用户输入的前缀，预测并补全为更专业的 Prompt
   */
  async autocomplete(prefix: string): Promise<string> {
    try {
      const models = this.getAvailableModels();
      if (models.length === 0) return '';

      const fastModelId = models.find(m =>
        m.name.toLowerCase().includes('llama') ||
        m.name.toLowerCase().includes('3b') ||
        m.name.toLowerCase().includes('flash') ||
        m.name.toLowerCase().includes('coder')
      )?.id || models[0].id;

      const { text } = await generateText({
        model: this.modelRegistry.getModel(fastModelId),
        system: `You are a Ghost-Text generator for a professional AI workspace.
Your ONLY goal is to continue or refine the user's input text to make it a better prompt.

CRITICAL RULES:
1. NEVER answer the user's question.
2. ONLY provide text that completes the user's thought or adds professional constraints.
3. Start exactly where the user left off.
4. Keep it under 12 words.
5. If the input is already professional, return nothing.

EXAMPLES:
- User: "帮我看看这个合同" -> Completion: "，重点检查知识产权条款和违约责任。"
- User: "ocean是什么项目？" -> Completion: "，请从技术架构和法律AI产品的定位进行深度解析。"
- User: "写一段代码" -> Completion: "实现一个基于 React 的高度自适应文本框。"`,
        messages: [{ role: 'user', content: prefix }],
        temperature: 0.1,
      });

      return text.trim();
    } catch (err: any) {
      this.logger.error(`Autocomplete error: ${err?.message || String(err)}`);
      return '';
    }
  }

  /**
   * 运行沙盒测试大模型调用
   */
  async runSandboxTest(
    message: string,
    activeSkill?: { name?: string; content?: string; triggerKws?: string[] },
    variables?: Record<string, string>,
  ) {
    const startTime = Date.now();
    
    // 1. 构建环境感知 Context
    const ctx: SkillContext = {
      userId: 'Sandbox-User',
      source: 'web',
      userMessage: message,
    };

    // 2. 构建系统基础 System Prompt
    let systemPrompt = await this.buildSystemPrompt(ctx);

    // 3. 调用 SkillResolver 匹配其它关联的 Skill
    let matchedSkills: any[] = [];
    let injectedPrompt = '';
    const resolved = await this.skillResolver.resolve(ctx);
    if (resolved.injectedPrompt) injectedPrompt = resolved.injectedPrompt;
    if (resolved.matchedSkills.length > 0) matchedSkills = resolved.matchedSkills;

    // 4. 强制注入当前正在编辑且未保存的 activeSkill
    let activeSkillInjected = '';
    if (activeSkill && activeSkill.content) {
      activeSkillInjected = `<injected_skills>\n`;
      activeSkillInjected += `以下为你注入了当前正在测试的AI专家技能，请根据用户的问题，综合运用它们的规则来回答。\n`;
      activeSkillInjected += `<skill name="${activeSkill.name || 'TestSkill'}">\n`;
      activeSkillInjected += `${activeSkill.content}\n`;
      activeSkillInjected += `</skill>\n`;
      activeSkillInjected += `</injected_skills>\n`;
      
      systemPrompt += `\n\n${activeSkillInjected}`;
    }

    // 如果还有其它关联命中的技能，追加到 Prompt 中
    if (injectedPrompt) {
      systemPrompt += `\n\n${injectedPrompt}`;
    }

    // 5. 替换 Mock 注入的上下文变量 (如 {{ticket_id}} -> 123)
    if (variables) {
      for (const [key, val] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        systemPrompt = systemPrompt.replace(regex, val);
        message = message.replace(regex, val);
      }
    }

    // 6. 运行大模型调用
    const model = this.modelRegistry.getModel();
    
    const { text, usage } = await generateText({
      model: model,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const latencyMs = Date.now() - startTime;

    return {
      response_text: text,
      raw_prompt: systemPrompt,
      metrics: {
        latency_ms: latencyMs,
        prompt_tokens: usage?.inputTokens || 0,
        completion_tokens: usage?.outputTokens || 0,
        total_tokens: usage?.totalTokens || 0,
      },
      matched_skills: [
        ...(activeSkill ? [{ id: activeSkill.name || 'TestSkill', name: activeSkill.name || 'TestSkill', match_type: 'forced' }] : []),
        ...matchedSkills,
      ],
    };
  }
}
