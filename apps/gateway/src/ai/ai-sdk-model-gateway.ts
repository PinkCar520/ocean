import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { streamText } from 'ai';
import { createChatModel } from './model.factory';
import type { ModelGateway, ModelStreamChunk } from './model-gateway';

/** 真实网关：经 ai-sdk 调用已配置的 provider（DeepSeek/Anthropic/Gemini/…）。 */
@Injectable()
export class AiSdkModelGateway implements ModelGateway {
  constructor(private readonly config: ConfigService) {}

  async *stream(
    input: string,
    opts?: { modelId?: string },
  ): AsyncIterable<ModelStreamChunk> {
    const result = streamText({
      model: createChatModel(this.config, opts?.modelId),
      messages: [{ role: 'user', content: input }],
    });
    for await (const text of result.textStream) {
      yield { text };
    }
  }
}
