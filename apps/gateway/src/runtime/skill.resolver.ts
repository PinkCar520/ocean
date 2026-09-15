import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { SkillContext } from '@ocean/core';

export interface SkillResolveResult {
  injectedPrompt?: string;
  matchedSkills: Array<{ id: string; name: string; match_type?: string }>;
}

interface SkillRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  content: string | null;
  triggerKws: string[];
}

interface EmbeddingRow {
  id: string;
  name: string;
  content: string | null;
  score: number;
}

/**
 * SkillResolver —— 技能解析（Agent Runtime 第 6/6 模块，第 4 条本地化）。
 *
 * 原实现代理 FastAPI /api/internal/skills/resolve；收敛后完全本地：
 * 1. 显式指定（ctx.skillIds）+ 关键词精确匹配（Prisma 本地查询）
 * 2. Embedding 语义兜底（调 Python 无状态计算 Job /api/internal/embedding 拿向量，
 *    再用 pgvector 在 skills.embedding 上匹配；计算 Job 不可用时静默降级）
 * 3. 组装 <injected_skills> Prompt 片段 + 落 SkillTriggerLog
 *
 * 返回结构对外不变（{injectedPrompt, matchedSkills}），失败静默降级。
 */
@Injectable()
export class SkillResolver {
  private readonly logger = new Logger(SkillResolver.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {}

  get fastapiUrl(): string {
    return (
      this.configService.get<string>('FASTAPI_URL') || 'http://localhost:8000'
    );
  }

  /** 解析当前消息命中的 Skills，返回注入 Prompt 片段与命中列表（失败静默降级）。 */
  async resolve(
    ctx: SkillContext,
    sessionId?: string,
  ): Promise<SkillResolveResult> {
    try {
      const skills = await this.prisma.skill.findMany({
        where: { isPublic: true },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          content: true,
          triggerKws: true,
        },
      });

      const userMsg = (ctx.userMessage || '').toLowerCase();
      const explicit = new Set(ctx.skillIds ?? []);

      const matched: Array<{
        id: string;
        name: string;
        content: string | null;
        match_type: string;
      }> = [];
      const pending: SkillRow[] = [];

      for (const skill of skills) {
        let shouldTrigger = false;
        let matchType = '';

        // 策略 A：显式指定（依赖上游传的 skillIds）
        if (explicit.has(skill.id) || explicit.has(skill.slug)) {
          shouldTrigger = true;
          matchType = 'explicit';
        }
        // 策略 B：关键词精确匹配
        else if (skill.triggerKws?.length) {
          for (const kw of skill.triggerKws) {
            if (kw && userMsg.includes(kw.toLowerCase())) {
              shouldTrigger = true;
              matchType = 'keyword';
              break;
            }
          }
        }

        if (shouldTrigger) {
          matched.push({
            id: skill.id,
            name: skill.name,
            content: skill.content,
            match_type: matchType,
          });
        } else {
          pending.push(skill);
        }
      }

      // 策略 C：Embedding 语义匹配（仅当关键词未命中或需要补全时）
      if (pending.length > 0 && matched.length < 3) {
        await this.matchByEmbedding(ctx.userMessage || '', pending, matched);
      }

      // 去重（理论上已唯一，保险起见）
      const seen = new Set<string>();
      const finalMatched = matched.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });

      const injectedPrompt = this.buildInjectedPrompt(finalMatched);

      // 记录触发日志（失败不影响主流程）
      await this.recordTriggerLog(sessionId, finalMatched, injectedPrompt);

      return {
        injectedPrompt: injectedPrompt || undefined,
        matchedSkills: finalMatched.map((s) => ({
          id: s.id,
          name: s.name,
          match_type: s.match_type,
        })),
      };
    } catch (err) {
      this.logger.error(`SkillResolver failed: ${err}`);
      return { matchedSkills: [] };
    }
  }

  /** 调用 Python 无状态 Embedding Job 生成向量，再以 pgvector 做语义匹配。 */
  private async matchByEmbedding(
    message: string,
    pending: SkillRow[],
    matched: Array<{
      id: string;
      name: string;
      content: string | null;
      match_type: string;
    }>,
  ): Promise<void> {
    let embedding: number[] | null = null;
    try {
      const res = await globalThis.fetch(
        `${this.fastapiUrl}/api/internal/embedding`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message }),
        },
      );
      if (!res.ok) {
        this.logger.warn(`Embedding Job failed: ${res.statusText}`);
        return;
      }
      const data = (await res.json()) as { embedding?: number[] };
      embedding = Array.isArray(data.embedding) ? data.embedding : null;
    } catch (err) {
      this.logger.warn(`Embedding Job unreachable: ${err}`);
      return;
    }

    if (!embedding || embedding.length === 0) return;

    try {
      const embJson = JSON.stringify(embedding);
      const rows = await this.prisma.$queryRaw<EmbeddingRow[]>`
        SELECT id, name, content, 1 - (embedding <=> ${embJson}::vector) AS score
        FROM skills
        WHERE id IN (${Prisma.join(pending.map((s) => s.id))})
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embJson}::vector
        LIMIT 2
      `;
      for (const row of rows) {
        if (row.score > 0.4) {
          matched.push({
            id: row.id,
            name: row.name,
            content: row.content,
            match_type: `embedding (score: ${row.score.toFixed(2)})`,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Embedding vector match failed: ${err}`);
    }
  }

  /** 组装 <injected_skills> 注入片段（与旧 FastAPI 输出格式一致）。 */
  private buildInjectedPrompt(
    finalMatched: Array<{
      id: string;
      name: string;
      content: string | null;
      match_type: string;
    }>,
  ): string {
    if (finalMatched.length === 0) return '';
    let prompt = '<injected_skills>\n';
    prompt +=
      '以下为你注入了多个专门领域的AI专家技能，请根据用户的问题，综合运用它们的规则来回答。\n';
    for (const s of finalMatched) {
      prompt += `<skill name="${s.name}">\n`;
      prompt += `${s.content ?? ''}\n`;
      prompt += `</skill>\n`;
    }
    prompt += '</injected_skills>\n';
    return prompt;
  }

  /** 落触发日志（幂等去重：同 session + 同 triggeredIds 近似重复不落）。 */
  private async recordTriggerLog(
    sessionId: string | undefined,
    finalMatched: Array<{ id: string }>,
    injectedPrompt: string,
  ): Promise<void> {
    try {
      await this.prisma.skillTriggerLog.create({
        data: {
          sessionId: sessionId ?? null,
          messageId: crypto.randomUUID(),
          triggeredIds: finalMatched.map((s) => s.id),
          injectedTokens: Math.floor(injectedPrompt.length / 4),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to save trigger log: ${err}`);
    }
  }
}
