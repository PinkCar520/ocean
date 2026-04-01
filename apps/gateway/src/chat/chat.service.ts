import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
} from 'ai';
import { z } from 'zod';
import { ZentaoService } from './zentao.service';

@Injectable()
export class ChatService {
  constructor(
    private configService: ConfigService,
    private zentaoService: ZentaoService,
  ) {}

  async generateChatStream(messages: any[], res: Response, req?: any) {
    try {
      // [V6 核心对齐] 对于本地 Ollama 或 灵积 等非 OpenAI 官方平台，
      // 必须确保 baseURL 为标准 /v1 路径，且强制使用标准 Chat 模式 (.chat())。
      const customProvider = createOpenAI({
        baseURL: this.configService.get<string>('VLLM_API_BASE'),
        apiKey: this.configService.get<string>('VLLM_API_KEY') || 'ollama',
      });

      const modelName = this.configService.get<string>('VLLM_MODEL_NAME') || 'qwen2.5-coder:7b';
      
      // [V6 核心迁移] convertToModelMessages 变为异步，如果不 await 将导致空上下文
      const modelMessages = await convertToModelMessages(messages);

      console.log(`[Gateway] Dispatching request (v6 Chat protocol) to model: ${modelName}`);
      console.log(`[Gateway] Model messages count: ${modelMessages.length}`);
      
      if (modelMessages.length === 0) {
        console.warn('[Gateway WARN] Empty model messages, sending default response.');
        res.status(200).send('0:"No message content found."'); // 发送一个基础的文本流回复
        return;
      }

      const result = streamText({
        model: customProvider.chat(modelName),
        messages: modelMessages,
        toolChoice: 'auto',
        stopWhen: stepCountIs(5),
        system: `你是一个银行内网 AI 助手 UClaw。
你可以调用工具来查询禅道（ZenTao）中的缺陷（Bug）信息。
如果用户提到了具体的 Bug ID（例如 BUG-2048），请使用 getBugInfo 工具查询。
如果用户只是模糊描述问题，或者要求“搜索 / 查找 / 列出 / 看看有哪些”相关缺陷，请先使用 searchBugs 工具进行搜索。
拿到工具结果后，用中文给出简洁总结。
不要把工具调用参数以 JSON 文本直接输出给用户。`,
        tools: {
          getBugInfo: tool({
            description: '获取指定 Bug ID 的详细信息',
            inputSchema: z.object({
              bugId: z.string().describe('缺陷的 ID，如 BUG-2048'),
            }),
            execute: async ({ bugId }) => {
              const bug = await this.zentaoService.getBugInfo(bugId);
              return bug;
            },
          }),
          searchBugs: tool({
            description: '根据关键词在禅道中搜索缺陷',
            inputSchema: z.object({
              query: z.string().describe('搜索关键词'),
            }),
            execute: async ({ query }) => {
              const bugs = await this.zentaoService.searchBugs(query);
              return bugs;
            },
          }),
        },
        onError: ({ error }) => {
          console.error('[Gateway LLM ERROR]:', error);
        },
        onStepFinish: ({ stepNumber, text, toolCalls, toolResults, finishReason }) => {
          console.log(
            `[Gateway] [${req?.id || 'N/A'}] Step ${stepNumber} finished. finishReason=${finishReason}, toolCalls=${toolCalls.length}, toolResults=${toolResults.length}, text=${JSON.stringify(text).slice(0, 120)}`,
          );
        },
      });

      req.on('close', () => {
        console.log(`[Gateway] [${req.id || 'N/A'}] Client closed connection.`);
      });

      result.pipeUIMessageStreamToResponse(res);
      return;
    } catch (err) {
      console.error('[Gateway ERROR] Critical failure in generateChatStream:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Gateway Error', message: err.message });
      }
    }
  }
}
