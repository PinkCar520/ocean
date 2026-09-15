import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SkillContext } from '@ocean/core';
import { RpcGateway } from '../chat/rpc.gateway';
import { SkillLoader } from '../skill/skill.loader';
import { SkillResolver } from './skill.resolver';

/**
 * PromptComposer —— System Prompt 组装器（Agent Runtime 第 2/6 模块）。
 * 从原 SkillOrchestrator 的 buildSystemPrompt 拆分，职责单一：把
 * 基础 Prompt、用户自定义指令、FastAPI 命中技能、显式本地技能、
 * 全量 Skill Catalog 与团队规范（.AIGUIDE.md）组合成最终 system prompt。
 * 不关心模型与执行，只产出文本。
 */
@Injectable()
export class PromptComposer {
  private readonly logger = new Logger(PromptComposer.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rpcGateway: RpcGateway,
    private readonly skillLoader: SkillLoader,
    private readonly skillResolver: SkillResolver,
    @Inject('PRISMA_CLIENT') private readonly prisma: any,
  ) {}

  async buildSystemPrompt(
    ctx: SkillContext,
    sessionId?: string,
  ): Promise<string> {
    const onlineClis = this.rpcGateway.getOnlineUsers();
    const promptPath =
      this.configService.get<string>('SYSTEM_PROMPT_PATH') ||
      'agents/prompts/system_prompt.md';

    let basePrompt = `你是银行内网 AI 助手 Ocean。
当前登录用户工号: ${ctx.userId}
当前在线的本地 CLI 节点: ${onlineClis.join(', ') || '无'}

你可以调用 MCP 工具以及直接操作开发者本地工作站的文件和 Git 仓库。
拿到工具执行结果后，请用中文进行通俗易懂的总结。`;

    try {
      const fullPath = require('path').resolve(process.cwd(), promptPath);
      if (require('fs').existsSync(fullPath)) {
        basePrompt = require('fs').readFileSync(fullPath, 'utf-8');
      }
    } catch (err) {
      this.logger.warn(
        `Failed to load prompt from ${promptPath}, using fallback.`,
      );
    }

    let prompt = basePrompt
      .replace('{{currentUserId}}', ctx.userId)
      .replace('{{onlineClis}}', onlineClis.join(', ') || '无');

    // 注入用户自定义指令 (对标 Claude Custom Instructions)
    try {
      const prefs = await this.prisma.userPreference.findFirst({
        where: { user: { workId: ctx.userId } },
      });
      if (prefs?.customInstructions) {
        prompt += `\n\n## 用户个性化指令 (Custom Instructions)\n以下是用户定义的回复偏好，请务必严格遵守：\n${prefs.customInstructions}`;
      }
    } catch (err: any) {
      this.logger.error(`Failed to fetch user preferences: ${err.message}`);
    }

    // FastAPI Skill 触发引擎命中的技能注入
    const { injectedPrompt, matchedSkills } = await this.skillResolver.resolve(
      ctx,
      sessionId,
    );
    if (injectedPrompt) {
      prompt += `\n\n${injectedPrompt}`;
      this.logger.log(
        `[PromptComposer] Injected ${matchedSkills.length} skills from FastAPI.`,
      );
    }

    // 显式注入通过 UI 选中的本地 Skills
    let explicitLocalSkillsInjected = false;
    if (ctx.skillIds && ctx.skillIds.length > 0) {
      let localInjected = '';
      for (const skillId of ctx.skillIds) {
        const skill = await this.skillLoader.getSkill(skillId);
        if (skill?.inquiries && skill.inquiries.length > 0) {
          prompt += `\n\n> [!IMPORTANT]\n> 此技能 [${skill.name}] 定义了意图澄清表单（Inquiries）。如果用户当前的话语中没有明确提供这些参数，请你**必须立刻调用 \`agp_intent_clarify\` 工具**，不要随意猜测或直接生成结果！`;
        }
        const content = await this.skillLoader.activate(skillId);
        if (content) {
          localInjected += `\n${content}`;
        }
      }
      if (localInjected) {
        prompt += `\n\n<injected_skills>\n以下为你注入了用户显式选定的专门领域的AI专家技能，请优先并重点根据它们的内容来回答用户的问题。如果用户询问该技能的作用，请严格基于以下内容进行回答：\n${localInjected}\n</injected_skills>`;
        explicitLocalSkillsInjected = true;
      }
    }

    // 仅在未明确指定 skill 且 FastAPI 没有下发特定技能时，才下发全量 Catalog 供其自行探索
    if (
      !explicitLocalSkillsInjected &&
      (!ctx.skillIds || ctx.skillIds.length === 0)
    ) {
      const catalogXml = await this.skillLoader.buildCatalogXml();
      prompt += `\n\n以下 Skills 提供了特定任务的专项指令。当用户的请求与某个 Skill 的描述匹配时，请调用 activate_skill 工具加载该 Skill 的完整指令。\n\n${catalogXml}`;
    }

    const guide = await this.skillLoader.loadAiguide(ctx.workspacePath);
    if (guide) {
      prompt += `\n\n## 团队开发规范（.AIGUIDE.md）\n${guide}`;
    }

    return prompt;
  }
}
