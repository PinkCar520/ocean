import { Injectable } from '@nestjs/common';
import type { ModelGateway, ModelStreamChunk } from './model-gateway';

/**
 * 模拟网关：WORKER_SIM_MS>0 时替换真实模型，供本地无 API key 的开发/冒烟/演示。
 * 按 WORKER_SIM_MS 均分三段产出文本，模拟流式输出。
 */
@Injectable()
export class SimModelGateway implements ModelGateway {
  constructor(private readonly simMs: number) {}

  async *stream(input: string): AsyncIterable<ModelStreamChunk> {
    if (this.simMs > 0) {
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.round(this.simMs / steps)),
        );
        yield {
          text: `[SIM ${i + 1}/${steps}] 已收到你的请求：${input.slice(0, 24)}…\n`,
        };
      }
    } else {
      yield { text: `[SIM] ${input.slice(0, 40)}` };
    }
  }
}
