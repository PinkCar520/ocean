import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SkillContext } from '@ocean/core';

export interface SkillResolveResult {
  injectedPrompt?: string;
  matchedSkills: Array<{ id: string; name: string; match_type?: string }>;
}

/**
 * SkillResolver —— 技能解析（Agent Runtime 第 6/6 模块）。
 * 从原 SkillOrchestrator 拆分：调用 FastAPI 技能触发引擎（/api/internal/skills/resolve）
 * 匹配当前消息命中的 Skills 并返回注入 Prompt 片段。
 * 同时暴露显式本地 Skill 的注入逻辑，供 PromptComposer 组合。
 */
@Injectable()
export class SkillResolver {
  private readonly logger = new Logger(SkillResolver.name);

  constructor(private readonly configService: ConfigService) {}

  get fastapiUrl(): string {
    return (
      this.configService.get<string>('FASTAPI_URL') || 'http://localhost:8000'
    );
  }

  /** 调用 FastAPI Skill 触发引擎，返回注入片段与命中技能列表（失败静默降级）。 */
  async resolve(
    ctx: SkillContext,
    sessionId?: string,
  ): Promise<SkillResolveResult> {
    try {
      const res = await globalThis.fetch(
        `${this.fastapiUrl}/api/internal/skills/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: ctx.userMessage || '',
            session_id: sessionId,
            skill_ids: ctx.skillIds,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        return {
          injectedPrompt: data.injected_prompt as string | undefined,
          matchedSkills: Array.isArray(data.matched_skills)
            ? data.matched_skills
            : [],
        };
      }
      this.logger.warn(`FastAPI skill resolve failed: ${res.statusText}`);
    } catch (err) {
      this.logger.error(`Failed to call FastAPI Skill Engine: ${err}`);
    }
    return { matchedSkills: [] };
  }
}
