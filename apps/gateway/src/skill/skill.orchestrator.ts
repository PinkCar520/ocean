import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText, convertToModelMessages, stepCountIs, tool } from 'ai';
import { jsonSchema } from 'ai';
import { MCPClientManager } from '../mcp/mcp-client.manager';
import { SkillLoader } from './skill.loader';
import { RpcGateway } from '../chat/rpc.gateway';
import { z } from 'zod';
import type { SkillContext } from '@uclaw/types';

/**
 * SkillOrchestrator
 *
 * Implements the AgentSkills client-side protocol for UClaw Gateway.
 *
 * AgentSkills 5-step flow:
 *   1. Discovery  — SkillLoader scans skills/ directory on startup
 *   2. Disclose   — System Prompt includes <available_skills> catalog (Tier 1, ~100 tokens)
 *   3. Activate   — LLM calls `activate_skill` tool when it matches a description
 *   4. Execute    — LLM reads full SKILL.md body and follows its instructions
 *   5. Manage     — Activated skill content is wrapped in <skill_content> tags (context-safe)
 *
 * Ref: https://agentskills.io/client-implementation/adding-skills-support
 */
@Injectable()
export class SkillOrchestrator {
  private readonly logger = new Logger(SkillOrchestrator.name);

  constructor(
    private configService: ConfigService,
    private mcpManager: MCPClientManager,
    private skillLoader: SkillLoader,
    private rpcGateway: RpcGateway,
  ) {}

  // ──────────────────────────────────────────────
  // Model
  // ──────────────────────────────────────────────
  private getModel(modelId?: string) {
    const modelsRaw = this.configService.get<string>('VLLM_MODEL_NAME') || 'qwen2.5-coder:7b';
    const models = modelsRaw.split(',').map((m) => m.trim());
    const selectedModel = modelId && models.includes(modelId) ? modelId : models[0];

    // 路由逻辑：识别百炼模型 (DashScope)
    const isCloudModel = selectedModel.includes('deepseek') || selectedModel.includes('omni');
    
    const baseURL = isCloudModel 
      ? this.configService.get<string>('DASHSCOPE_API_BASE') 
      : this.configService.get<string>('VLLM_API_BASE');
      
    const apiKey = isCloudModel 
      ? this.configService.get<string>('DASHSCOPE_API_KEY') 
      : (this.configService.get<string>('VLLM_API_KEY') || 'ollama');

    this.logger.log(`[Orchestrator] Routing model "${selectedModel}" to ${isCloudModel ? 'DashScope' : 'Ollama'}`);

    return createOpenAI({
      baseURL,
      apiKey,
    }).chat(selectedModel);
  }

  getAvailableModels() {
    const modelsRaw = this.configService.get<string>('VLLM_MODEL_NAME') || 'qwen2.5-coder:7b';
    return modelsRaw.split(',').map((id) => {
      const modelId = id.trim();
      const isCloud = modelId.includes('deepseek') || modelId.includes('omni');
      
      return {
        id: modelId,
        name: modelId,
        provider: isCloud ? 'Alibaba Bailian' : 'Private Ollama',
        icon: isCloud ? 'Cloud' : 'Cpu',
        color: isCloud ? 'text-orange-500' : 'text-blue-500',
      };
    });
  }

  // ──────────────────────────────────────────────
  // Step 2 + 3: System Prompt (AgentSkills Tier 1 + behavioral instructions)
  // ──────────────────────────────────────────────
  private async buildSystemPrompt(ctx: SkillContext): Promise<string> {
    const onlineClis = this.rpcGateway.getOnlineUsers();

    // Base identity prompt
    let prompt = `你是银行内网 AI 助手 UClaw。
当前登录用户工号: ${ctx.userId}
来源渠道: ${ctx.source}
当前在线的本地 CLI 节点: ${onlineClis.join(', ') || '无'}

你可以调用 MCP 工具（禅道、Jenkins、GitLab 等）以及通过 runLocalCommand 在开发者本地工作站执行指令。
拿到工具执行结果后，请用中文进行通俗易懂的总结。`;

    // AgentSkills Tier 1: inject skill catalog (<available_skills>)
    // + behavioral instructions (per spec: tell LLM how to activate)
    const catalogXml = await this.skillLoader.buildCatalogXml();
    prompt += `

以下 Skills 提供了特定任务的专项指令。当用户的请求与某个 Skill 的描述匹配时，
请调用 activate_skill 工具加载该 Skill 的完整指令，然后再开始执行任务。

${catalogXml}`;

    // Always inject .AIGUIDE.md (team conventions, global)
    const guide = await this.skillLoader.loadAiguide(ctx.workspacePath);
    if (guide) {
      prompt += `\n\n## 团队开发规范（.AIGUIDE.md，必须严格遵守）\n${guide}`;
      this.logger.log('.AIGUIDE.md injected into system prompt');
    }

    return prompt;
  }

  // ──────────────────────────────────────────────
  // Tools: MCP + local CLI + activate_skill
  // ──────────────────────────────────────────────
  private async buildTools(ctx: SkillContext): Promise<Record<string, any>> {
    // MCP tools (dynamic from mcp.config.json)
    const mcpTools = await this.mcpManager.getAITools();

    // Local CLI RPC tool (until mcp-local-fs is ready)
    const localCliTools = {
      runLocalCommand: tool({
        description: '在开发者的本地工作站执行安全指令（ls、git 操作、npm 构建等）',
        inputSchema: z.object({
          userId: z.string().describe('目标用户工号'),
          command: z
            .enum(['ls', 'git_status', 'git_add', 'git_commit', 'npm_build', 'read_file'])
            .describe('执行的指令名'),
          args: z.record(z.string(), z.any()).optional().describe('指令参数'),
        }),
        execute: async ({ userId, command, args }) => {
          try {
            const result = await this.rpcGateway.sendToCli(userId, command, args || {});
            return { status: 'Success', command, result };
          } catch (err: any) {
            return { status: 'Error', message: err.message };
          }
        },
      } as any),
    };

    // AgentSkills Step 4: activate_skill tool
    // LLM calls this to load full SKILL.md body (Tier 2) when description matches
    const skillLoader = this.skillLoader;
    const logger = this.logger;
    const skillTools = {
      activate_skill: tool({
        description:
          '当用户请求与某个 Skill 的描述匹配时，调用此工具加载该 Skill 的完整执行指令。加载后按照指令执行任务。',
        inputSchema: z.object({
          skill_name: z
            .string()
            .describe('要激活的 Skill 名称，必须与 <available_skills> 中的 <name> 完全一致'),
        }),
        execute: async ({ skill_name }) => {
          const content = await skillLoader.activate(skill_name);
          if (!content) {
            logger.warn(`activate_skill: skill "${skill_name}" not found`);
            return {
              error: `Skill "${skill_name}" not found. Available skills are listed in <available_skills>.`,
            };
          }
          logger.log(`activate_skill: "${skill_name}" delivered to LLM`);
          return { skill_content: content };
        },
      } as any),
    };

    return { ...mcpTools, ...localCliTools, ...skillTools };
  }

  // ──────────────────────────────────────────────
  // Public API: streaming (Web)
  // ──────────────────────────────────────────────
  async streamResponse(
    messages: any[],
    res: Response,
    ctx: SkillContext,
    modelId?: string,
  ): Promise<void> {
    try {
      this.logger.debug(`streamResponse called with ${messages?.length} messages`);
      if (!Array.isArray(messages)) {
        throw new Error('messages must be an array');
      }

      // 兼容某些版本的 AI SDK (如 6.0.x)，确保 User/Assistant 消息具有 parts 属性
      const sanitizedMessages = messages.map(m => {
        if (!m.parts && typeof m.content === 'string') {
          return { ...m, parts: [{ type: 'text', text: m.content }] };
        }
        return m;
      });

      const modelMessages = await convertToModelMessages(sanitizedMessages);
      this.logger.debug(`modelMessages converted: ${modelMessages?.length}`);

      const [systemPrompt, tools] = await Promise.all([
        this.buildSystemPrompt(ctx),
        this.buildTools(ctx),
      ]);
      
      this.logger.debug(`SystemPrompt built (${systemPrompt?.length} chars)`);
      this.logger.debug(`Tools built: [${Object.keys(tools || {}).join(', ')}]`);

      this.logger.log(`[Orchestrator] AgentSkills mode for user ${ctx.userId}`);

      const result = streamText({
        model: this.getModel(modelId),
        messages: modelMessages,
        toolChoice: 'auto',
        stopWhen: stepCountIs(10),
        system: systemPrompt,
        tools,
        onStepFinish: ({ stepNumber, toolCalls }) => {
          this.logger.debug(`Step ${stepNumber} finished. Tool calls: ${toolCalls?.length || 0}`);
        },
      });

      result.pipeUIMessageStreamToResponse(res);
    } catch (err: any) {
      this.logger.error(`Stream error: ${err.message}`);
      if (err.stack) this.logger.error(err.stack);
      res.status(500).send(err.message);
    }
  }

  // ──────────────────────────────────────────────
  // Public API: text response (IM Bot)
  // ──────────────────────────────────────────────
  async textResponse(userId: string, content: string, source: 'im' | 'cli' = 'im'): Promise<string> {
    try {
      const ctx: SkillContext = {
        userId,
        source,
        userMessage: content,
      };

      const [systemPrompt, tools] = await Promise.all([
        this.buildSystemPrompt(ctx),
        this.buildTools(ctx),
      ]);

      const { text } = await generateText({
        model: this.getModel(),
        messages: [{ role: 'user', content }],
        toolChoice: 'auto',
        stopWhen: stepCountIs(10),
        system: systemPrompt,
        tools,
      });

      return text;
    } catch (err: any) {
      this.logger.error(`Text response error: ${err.message}`);
      return `抱歉，处理您的请求时发生了错误: ${err.message}`;
    }
  }
}
