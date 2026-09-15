import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { streamText } from 'ai';
import { createChatModel } from './model.factory';
import type {
  ModelGateway,
  ModelGenerateRequest,
  ModelGenerateResult,
  ModelMessage,
} from './model-gateway';

/** 把与实现无关的 ModelMessage 转换为 ai-sdk UIMessage 格式。 */
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
          args: tc.input,
        });
      }
      return { role: 'assistant' as const, content: parts };
    }
    case 'tool':
      return {
        role: 'tool' as const,
        content: [
          { type: 'tool-result', toolCallId: message.toolCallId, result: message.result },
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

    let text = '';
    for await (const delta of result.textStream) {
      text += delta;
      if (onDelta) await onDelta(delta);
    }

    const toolCalls = (await result.toolCalls).map((tc) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      input: (tc.input ?? {}) as Record<string, unknown>,
    }));

    return { text, toolCalls };
  }
}
