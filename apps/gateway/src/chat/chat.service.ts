import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UIMessageChunk } from 'ai';
import { RunService } from '../run/run.service';

const RUN_POLL_MS = 150;
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

/** 把 messages 序列化为 Run 的单 prompt（v1：模型只见组装后的文本，多轮上下文靠文本拼接）。 */
function buildRunPrompt(
  messages: any[],
  ctx: {
    userMessage?: string;
    skillIds?: string[];
    search?: boolean;
    knowledge?: boolean;
  },
  modelId?: string,
): string {
  const parts: string[] = [];
  for (const msg of messages ?? []) {
    const role = msg.role ?? 'user';
    const content = Array.isArray(msg.content)
      ? msg.content
          .map((c: any) => (typeof c === 'string' ? c : (c?.text ?? '')))
          .join('\n')
      : typeof msg.content === 'string'
        ? msg.content
        : (msg.parts ?? [])
            .filter(
              (part: any) =>
                part.type === 'text' && typeof part.text === 'string',
            )
            .map((part: any) => part.text)
            .join('\n');
    if (content) parts.push(`${role}: ${content}`);
  }
  if (ctx.userMessage && !parts.some((p) => p.includes(ctx.userMessage!))) {
    parts.push(`user: ${ctx.userMessage}`);
  }
  const flags: string[] = [];
  if (ctx.skillIds?.length) flags.push(`skills: ${ctx.skillIds.join(',')}`);
  if (ctx.search) flags.push('search: on');
  if (ctx.knowledge) flags.push('knowledge: on');
  if (modelId) flags.push(`model: ${modelId}`);
  if (flags.length) parts.push(`[context] ${flags.join(' | ')}`);
  return parts.join('\n');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class ChatService {
  constructor(
    private configService: ConfigService,
    private runService: RunService,
  ) {}

  /** 是否启用 Run 驱动聊天（默认开启，CHAT_USE_RUN=false 显式回退旧直驱；Run 引擎稳定后移除旧链路）。 */
  isRunMode(): boolean {
    return this.configService.get('CHAT_USE_RUN', 'true') !== 'false';
  }

  /**
   * Run 驱动聊天：订阅 Run 事件并转换为标准 UI message chunks。
   */
  async runChatStream(
    messages: any[],
    ctx: {
      userId: string;
      dbId?: string;
      userMessage?: string;
      skillIds?: string[];
      search?: boolean;
      knowledge?: boolean;
      spaceId?: string;
    },
    modelId: string | undefined,
    sessionId: string | undefined,
    onChunk: (chunk: UIMessageChunk) => void,
  ): Promise<string> {
    const input = buildRunPrompt(messages, ctx, modelId);
    // Phase 6 6b：Run 归属当前 Space（由 controller 按会话归属/body 解析，默认 work）。
    // Run 链路以 DB 用户标识（dbId）为归属：membership/space 校验存的是 dbId，
    // 不能使用工号 workId（否则 User W1 has no access）。
    const userId = ctx.dbId ?? ctx.userId;
    const spaceId = ctx.spaceId ?? 'work';
    const snapshot = await this.runService.create(userId, {
      space: { id: spaceId, type: 'work' },
      input,
      priority: 'interactive',
      metadata: { sessionId, modelId },
    });
    const runId = snapshot.run.id;
    let after = snapshot.events.at(-1)?.sequence ?? -1;
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let output = '';
    let textStarted = false;
    onChunk({ type: 'start' });

    const endText = () => {
      if (textStarted) {
        onChunk({ type: 'text-end', id: 'run-output' });
        textStarted = false;
      }
    };

    while (Date.now() < deadline) {
      const events = await this.runService.listEvents(runId, userId, after);
      for (const event of events) {
        after = Math.max(after, event.sequence);
        if (event.type === 'run.output_delta') {
          output += event.delta;
          if (!textStarted) {
            onChunk({ type: 'text-start', id: 'run-output' });
            textStarted = true;
          }
          onChunk({
            type: 'text-delta',
            id: 'run-output',
            delta: event.delta,
          });
        } else if (event.type === 'artifact.created') {
          onChunk({
            type: 'data-artifact',
            data: {
              runId: event.runId,
              artifactId: event.artifact?.id,
              name: event.artifact?.name,
              uri: event.artifact?.uri,
              contentType: event.artifact?.contentType,
            },
          });
        } else if (
          event.type === 'run.status_changed' &&
          TERMINAL_RUN_STATUSES.has(event.status)
        ) {
          endText();
          if (event.status === 'failed') {
            onChunk({
              type: 'error',
              errorText: 'Run failed. See gateway logs for details.',
            });
          }
          onChunk({
            type: 'finish',
            finishReason:
              event.status === 'failed'
                ? 'error'
                : event.status === 'cancelled'
                  ? 'interrupted'
                  : 'stop',
          });
          return output;
        }
      }
      if (events.length === 0) await sleep(RUN_POLL_MS);
    }
    endText();
    onChunk({
      type: 'error',
      errorText: `Run timed out. Check /api/runs/${runId} for details.`,
    });
    onChunk({ type: 'finish', finishReason: 'error' });
    return output;
  }

  /**
   * 非流式 Run 执行（IM/CLI 等同步渠道）：创建 run → 轮询事件至终态 → 拼接文本。
   * 失败时返回以 "Run failed:" 开头的文本，由调用方原样回给渠道。
   */
  async runToText(
    userId: string,
    input: string,
    opts: { spaceId?: string; source?: string } = {},
  ): Promise<string> {
    const snapshot = await this.runService.create(userId, {
      space: { id: opts.spaceId ?? 'work', type: 'work' },
      input,
      priority: 'interactive',
      metadata: { source: opts.source ?? 'im' },
    });
    const runId = snapshot.run.id;
    let after = snapshot.events.at(-1)?.sequence ?? -1;
    let output = '';
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const events = await this.runService.listEvents(runId, userId, after);
      for (const event of events) {
        after = Math.max(after, event.sequence);
        if (event.type === 'run.output_delta') {
          output += event.delta;
        } else if (
          event.type === 'run.status_changed' &&
          TERMINAL_RUN_STATUSES.has(event.status)
        ) {
          return event.status === 'failed'
            ? `Run failed: ${(event as { message?: string }).message ?? 'see gateway logs'}`
            : output;
        }
      }
      if (events.length === 0) await sleep(RUN_POLL_MS);
    }
    return output || 'Run timeout: check /api/runs for details';
  }

  /**
   * 获取当前网关配置的模型列表 (供前端动态展示)
   * ⚠️ 注意：前端应优先迁移到使用 SkillOrchestrator.getAvailableModels()
   */
  getAvailableModels() {
    const models = [
      {
        id: this.configService.get('DEEPSEEK_MODEL'),
        provider: 'deepseek',
        icon: 'Sparkles',
        color: 'text-blue-500',
      },
      {
        id: this.configService.get('ANTHROPIC_MODEL'),
        provider: 'anthropic',
        icon: 'Brain',
        color: 'text-purple-500',
      },
      {
        id: this.configService.get('GEMINI_MODEL'),
        provider: 'gemini',
        icon: 'Globe',
        color: 'text-orange-500',
      },
      {
        id: this.configService.get('DASHSCOPE_MODEL'),
        provider: 'dashscope',
        icon: 'Cloud',
        color: 'text-indigo-500',
      },
      {
        id: this.configService.get('OPENAI_MODEL'),
        provider: 'openai',
        icon: 'Zap',
        color: 'text-green-500',
      },
      {
        id: this.configService.get('LOCAL_MODEL'),
        provider: 'local',
        icon: 'Terminal',
        color: 'text-gray-500',
      },
    ];

    return models
      .filter((m) => m.id)
      .map((m) => ({
        id: m.id,
        name: m.id,
        provider: m.provider,
        icon: m.icon,
        color: m.color,
      }));
  }
}
