import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { streamText } from 'ai';
import { createChatModel } from './model.factory';
import type {
  ModelGateway,
  ModelGenerateRequest,
  ModelGenerateResult,
  ModelMessage,
  ModelToolCall,
} from './model-gateway';

/** 把与实现无关的 ModelMessage 转换为 ai-sdk v7 ModelMessage 格式。
 * v7 的 ModelMessage：assistant.content 为字符串或 parts 数组（含
 * tool-call part）；tool 消息 content 必须为 tool-result part 数组，
 * 且带 toolName + output({type,value})。不可用顶层 toolCalls/字符串 content。 */
function toUiMessage(message: ModelMessage) {
  switch (message.role) {
    case 'user':
      return { role: 'user' as const, content: message.text };
    case 'assistant': {
      const parts: unknown[] = [];
      if (message.text) parts.push({ type: 'text', text: message.text });
      for (const tc of message.toolCalls ?? []) {
        parts.push({
          type: 'tool-call',
          toolCallId: tc.id,
          toolName: tc.name,
          input: tc.input,
        });
      }
      return { role: 'assistant' as const, content: parts };
    }
    case 'tool':
      return {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result',
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            output: {
              type: 'json',
              value: message.result ?? null,
            },
          },
        ],
      };
  }
}

/** 真实网关：经 ai-sdk 调用已配置的 provider（DeepSeek/Anthropic/Gemini/百炼…）。 */
@Injectable()
export class AiSdkModelGateway implements ModelGateway {
  constructor(private readonly config: ConfigService) {}

  async generate(req: ModelGenerateRequest): Promise<ModelGenerateResult> {
    const { messages, modelId, tools, onDelta } = req;

    const options: Record<string, unknown> = {
      model: createChatModel(this.config, modelId),
      messages: messages.map(toUiMessage),
    };
    if (tools && tools.length > 0) {
      const toolSet = Object.fromEntries(
        tools.map((tool) => [
          tool.name,
          { description: tool.description, inputSchema: tool.inputSchema },
        ]),
      );
      options.tools = toolSet;
    }

    const result = streamText(options as Parameters<typeof streamText>[0]);

    // textStream 优先（保留流式增量）；thinking 模型（如 qwen3-max 系列）在
    // 工具回喂后可能只产出 reasoning 而无 content，此时 textStream 抛
    // "No output generated"——回退读取 reasoningStream 作为输出。
    let text = '';
    try {
      for await (const delta of result.textStream) {
        text += delta;
        if (onDelta) await onDelta(delta);
      }
    } catch (error) {
      let reasoning = '';
      try {
        reasoning = (await result.reasoningText) ?? '';
      } catch {
        /* reasoning 同样不可用时放弃 */
      }
      if (reasoning) {
        text = reasoning;
        if (onDelta) await onDelta(reasoning);
      } else {
        throw error;
      }
    }

    let toolCalls: ModelToolCall[] = [];
    try {
      toolCalls = (await result.toolCalls).map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        input: (tc.input ?? {}) as Record<string, unknown>,
      }));
    } catch (error) {
      // 若 textStream 已回退到 reasoning，toolCalls 解析失败时视为无工具调用
      if (!text) throw error;
    }

    return { text, toolCalls };
  }
}
