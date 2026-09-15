import { Controller, Get, Post, Body, Req, Res, Headers, SetMetadata, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { SkillOrchestrator } from '../skill/skill.orchestrator';
import { SkillLoader } from '../skill/skill.loader';
import { RpcGateway } from './rpc.gateway';
import { SessionService } from '../session/session.service';
import { UpChatHandler } from '@ocean/mcp-im';
import type { SkillContext } from '@ocean/core';
import { autocompleteRequestSchema, chatRequestSchema, generateTitleRequestSchema } from '@ocean/contracts';
import { IS_PUBLIC_KEY } from '../auth/sso.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/chat')
export class ChatController {
  private imHandler = new UpChatHandler();

  constructor(
    private readonly skillOrchestrator: SkillOrchestrator,
    private readonly skillLoader: SkillLoader,
    private readonly rpcGateway: RpcGateway,
    private readonly sessionService: SessionService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * GET /api/chat/skills
   * 返回当前 Gateway 发现的所有技能列表（SKILL.md frontmatter）
   */
  @Public()
  @Get('skills')
  async getSkills() {
    const skills = await this.skillLoader.discover();
    return {
      success: true,
      skills: skills.map(s => ({
        id: s.name,
        name: s.name,
        description: s.description,
        version: s.metadata?.version || '1.0.0',
        compatibility: s.compatibility,
        author: s.metadata?.author,
      })),
    };
  }

  /**
   * GET /api/chat/models
   * 返回当前 Gateway 可用的模型列表，并附带当前影子用户的持久化 ID
   */
  @Public()
  @Get('models')
  async getModels(@Req() req: any) {
    const models = this.skillOrchestrator.getAvailableModels();
    return {
      models,
      debug: {
        dbId: req.user?.dbId, // 验证影子用户 UUID
        workId: req.user?.workId,
        synced: !!req.user?.dbId
      }
    };
  }

  /**
   * GET /api/chat/me
   * 返回当前登录用户的影子用户详情（由 SsoAuthGuard 注入）
   */
  @Get('me')
  async getMe(@Req() req: any) {
    // req.user 是由 SsoAuthGuard 在鉴权通过后注入的
    return {
      success: true,
      user: req.user,
      platform: 'Ocean Workbuddy',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/chat
   * Web 端主聊天接口（SSE 直接流式）
   */
  @Post()
  async handleChatStream(
    @Body() rawBody: unknown,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const parsedBody = chatRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      throw new BadRequestException({
        message: 'Invalid chat request',
        issues: parsedBody.error.issues,
      });
    }
    const body = parsedBody.data;
    const requestId = Math.random().toString(36).substring(7);
    const messages = body.messages || (body.text ? [{ role: 'user', content: body.text }] : []);
    const sessionId: string | undefined = body.sessionId ?? undefined;

    // 提取最后一条用户消息文本，用于意图识别
    const userMessage: string =
      body.text ||
      (Array.isArray(messages) && messages.length > 0
        ? (messages.at(-1)?.content ?? '')
        : '');
    const modelId: string | undefined = body.modelId || body.model;

    console.log(`[Gateway] [${requestId}] Skill mode. Employee: ${req.user?.workId} (${req.user?.dbId}), session: ${sessionId || 'none'}, msg: "${userMessage.slice(0, 60)}..."`);

    // 从消息的 parts 中提取技能
    const skillIdsFromParts: string[] = [];
    if (Array.isArray(messages)) {
      messages.forEach(msg => {
        if (msg.role === 'user' && Array.isArray(msg.parts)) {
          msg.parts.forEach(part => {
            if (part.type === 'skill' && part.name) {
              skillIdsFromParts.push(part.name);
            }
          });
        }
      });
    }

    const mergedSkillIds = [
      ...(body.skillIds || []),
      ...(body.activeSkills || []),
      ...(body.skills || []),
      ...(body.skillId ? [body.skillId] : []),
      ...skillIdsFromParts
    ];

    // Session Binding Logic
    let finalSkillIds = mergedSkillIds.length > 0 ? Array.from(new Set(mergedSkillIds)) : undefined;

    // Phase 6 6b：Run 归属 Space——会话归属优先（防越权），body 兜底，默认 work。
    // 新会话（无 sessionId）按客户端当前 Space 创建；已有会话固定归属其创建时的 Space。
    let resolvedSpaceId = body.spaceId ?? 'work';
    if (sessionId) {
      try {
        const session = await this.sessionService.getSessionById(sessionId, req.user?.dbId);
        if (session?.spaceId) resolvedSpaceId = session.spaceId;
        if (session) {
          if (finalSkillIds && finalSkillIds.length > 0) {
            await this.sessionService.updateSession(sessionId, req.user?.dbId, { activeSkillId: finalSkillIds[0] });
          } else if (session.activeSkillId) {
            finalSkillIds = [session.activeSkillId];
          }
        }
      } catch (err) {
        console.warn(`[Gateway] Session binding failed for ${sessionId}:`, err);
      }
    }

    const ctx: SkillContext = {
      userId: req.user?.workId || 'Anonymous',
      source: 'web',
      userMessage,
      workspacePath: body.workspacePath,
      skillIds: finalSkillIds,
      // @ts-ignore
      search: body.search,
      // @ts-ignore
      knowledge: body.knowledge,
      // @ts-ignore
      spaceId: resolvedSpaceId,
    };

    // SSE 响应头
    res.setHeader('Content-Type', 'text/x-vercel-ai-data-stream; charset=utf-8');
    res.setHeader('X-Vercel-AI-Data-Stream', 'v1');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      // 第 3 项：Run 驱动聊天（CHAT_USE_RUN=true 时创建 AgentRun 并订阅 run events 转译；
      // 否则保留旧 SkillOrchestrator 直驱链路，作为回退）
      if (this.chatService.isRunMode()) {
        await this.chatService.runChatStream(
          messages,
          ctx,
          modelId,
          sessionId,
          (chunk: string) => {
            res.write(chunk);
          },
        );
        return;
      }
      await this.skillOrchestrator.streamResponse(
        messages,
        ctx,
        modelId,
        sessionId,
        (chunk: string) => {
          res.write(chunk);
        },
      );
    } catch (error: any) {
      console.error(`[Gateway] [${requestId}] Stream error:`, error.message);
    } finally {
      res.end();
    }
  }

  /**
   * POST /api/chat/webhook-im
   * 银联 UpChat IM Bot Webhook
   * 🔄 已切换到 SkillOrchestrator（非流式文本响应）
   */
  @Public()
  @Post('webhook-im')
  async handleImWebhook(
    @Body() payload: any,
    @Res() res: Response,
    @Headers('x-up-signature') signature: string,
  ) {
    if (signature) {
      console.log(`[Gateway] Verifying UnionPay UpChat signature: ${signature}`);
    }

    const message = this.imHandler.parseWebhook(payload);
    if (!message) {
      return res.status(200).send('Ignored');
    }

    console.log(`[Gateway] UpChat Webhook from ${message.senderName} (${message.senderId}): ${message.content}`);

    // 立即返回 200 防止银联服务器超时重试
    res.status(200).send('OK');

    // 异步走 Skill 编排
    const replyText = await this.skillOrchestrator.textResponse(
      message.senderId,
      message.content,
      'im',
    );

    console.log(`[Gateway] Agent Reply to UpChat (${message.senderId}): ${replyText}`);
    // 真实生产环境：this.imHandler.sendReply(message.chatId, { text: replyText });
  }

  /**
   * POST /api/chat/generate-title
   * 为对话生成摘要标题
   */
  @Public()
  @Post('generate-title')
  async generateTitle(@Body() rawBody: unknown) {
    const parsedBody = generateTitleRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      throw new BadRequestException({ message: 'Invalid title request', issues: parsedBody.error.issues });
    }
    const { message, modelId } = parsedBody.data;
    
    const title = await this.skillOrchestrator.generateTitle(message, modelId);
    return { success: true, title };
  }

  /**
   * POST /api/chat/autocomplete
   * AI 智能补全 (Ghost Text)
   */
  @Public()
  @Post('autocomplete')
  async autocomplete(@Body() rawBody: unknown) {
    const parsedBody = autocompleteRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      throw new BadRequestException({ message: 'Invalid autocomplete request', issues: parsedBody.error.issues });
    }
    const { prefix } = parsedBody.data;
    if (!prefix || prefix.length < 3) return { completion: '' };
    
    const completion = await this.skillOrchestrator.autocomplete(prefix);
    return { completion };
  }

  /**
   * POST /api/chat/audio/transcribe
   * 接收前端切片传来的音频 Blob，调用 Whisper API 进行转录
   */
  @Public()
  @Post('audio/transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribeAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No audio file provided');
    }

    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY; // Fallback or proper logic
    const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (!openaiApiKey) {
      throw new BadRequestException('OpenAI API key is not configured on the server');
    }

    try {
      const formData = new FormData();
      // Whisper requires a filename with an extension. Use .webm as default for web audio chunks
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'audio/webm' });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');

      const response = await fetch(`${openaiBaseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('[Gateway] Audio transcription failed:', errorData);
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const result = await response.json();
      return { success: true, text: result.text || '' };
    } catch (error: any) {
      console.error('[Gateway] Audio transcription exception:', error);
      throw new BadRequestException(error.message);
    }
  }
}
