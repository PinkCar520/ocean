import { Injectable } from '@nestjs/common';
import type {
  ModelGateway,
  ModelGenerateRequest,
  ModelGenerateResult,
} from './model-gateway';

/**
 * 模拟网关：WORKER_SIM_MS>0 时替换真实模型，供本地无 API key 的开发/冒烟/演示。
 *
 * - 纯文本：按 WORKER_SIM_MS 均分三段产出文本，模拟流式输出。
 * - 工具循环演示：当消息含「调用工具」且暴露了 tools 时，返回一次 echo 工具调用
 *   （input.text = 用户原始输入），验证 agent loop 全链路而无需真实模型。
 */
@Injectable()
export class SimModelGateway implements ModelGateway {
  constructor(private readonly simMs: number) {}

  async generate(req: ModelGenerateRequest): Promise<ModelGenerateResult> {
    const { messages, tools, onDelta } = req;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const input = lastUser && 'text' in lastUser ? lastUser.text : '';

    // 工具循环演示：显式触发、存在可用工具、且历史中尚无工具结果时
    // 请求一次 echo（有 tool 结果说明循环已在回喂阶段，避免无限触发）。
    const hasToolResult = messages.some((m) => m.role === 'tool');
    if (
      !hasToolResult &&
      tools &&
      tools.length > 0 &&
      input.includes('调用工具') &&
      tools.some((t) => t.name === 'echo')
    ) {
      const id = `sim-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const text = '[SIM] 我将调用 echo 工具：\n';
      if (onDelta) await onDelta(text);
      return {
        text,
        toolCalls: [{ id, name: 'echo', input: { text: input } }],
      };
    }

    // 纯文本（流式）
    let text = '';
    if (this.simMs > 0) {
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.round(this.simMs / steps)),
        );
        const delta = `[SIM ${i + 1}/${steps}] 已收到你的请求：${input.slice(0, 24)}…\n`;
        text += delta;
        if (onDelta) await onDelta(delta);
      }
    } else {
      text = `[SIM] ${input.slice(0, 40)}`;
      if (onDelta) await onDelta(text);
    }
    return { text, toolCalls: [] };
  }
}
