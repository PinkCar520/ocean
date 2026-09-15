import { Injectable } from '@nestjs/common';
import { convertToModelMessages } from 'ai';
import type { SkillContext } from '@ocean/core';
import { RAGService } from '../rag/rag.service';

export type AssembledMessage = {
  role: string;
  content: string;
  parts?: any[];
  experimental_attachments?: any[];
} & Record<string, any>;

/**
 * ContextAssembler —— 消息上下文装配器（Agent Runtime 第 3/6 模块）。
 * 从原 SkillOrchestrator 拆分：把客户端消息归一化为 AI SDK 兼容形态、
 * 在搜索/知识模式下注入 RAG 背景资料、并转换为模型消息。
 * 只做上下文处理，不涉及模型执行。
 */
@Injectable()
export class ContextAssembler {
  constructor(private readonly ragService: RAGService) {}

  /** 归一化消息：确保每条消息都有 parts（AI SDK 要求）。 */
  sanitizeMessages(messages: any[]): AssembledMessage[] {
    return (messages || []).map((m) => {
      if (!m) return { role: 'user', content: '', parts: [] };
      let parts = m.parts;
      if (!parts && typeof m.content === 'string') {
        parts = [{ type: 'text', text: m.content }];
      }
      return { ...m, parts: parts || [] };
    });
  }

  /**
   * 注入 RAG 背景资料：搜索/知识模式下，把最后一条用户消息前拼接
   * 知识库检索到的相关文档片段。
   */
  async injectRagContext(
    messages: AssembledMessage[],
    ctx: SkillContext,
    mode: 'search' | 'knowledge' | 'none',
  ): Promise<{ injected: boolean }> {
    if (mode === 'none' || !ctx.userMessage) return { injected: false };
    const contextResults = await this.ragService.searchSimilarity(
      ctx.userMessage,
      3,
    );
    if (contextResults.length === 0) return { injected: false };

    const contextText = contextResults
      .map((r) => `[Document: ${r.title}]\n${r.content}`)
      .join('\n\n');
    const ragPrompt = `以下是来自 Ocean 知识库的相关背景资料，请结合这些信息回答用户问题：\n\n${contextText}`;

    const lastIdx = messages.length - 1;
    if (lastIdx >= 0 && messages[lastIdx].role === 'user') {
      messages[lastIdx].content =
        `${ragPrompt}\n\n用户问题：${messages[lastIdx].content}`;
      if (messages[lastIdx].parts) {
        messages[lastIdx].parts = [
          { type: 'text', text: messages[lastIdx].content },
        ];
      }
    }
    return { injected: true };
  }

  /** 转换为 AI SDK 模型消息（convertToModelMessages 为 async）。 */
  toModelMessages(messages: AssembledMessage[]) {
    return convertToModelMessages(messages as any);
  }
}
