/**
 * ModelGateway 抽象与注入 token（与实现分离，避免测试链路引入 ai-sdk ESM 依赖）。
 *
 * Run 链路的模型调用抽象，对应 worker-design-reference.md 5.2 的
 * StepExecutor/ModelCall：Worker 不直接依赖 ai-sdk 与 provider 配置，
 * 只依赖本接口；实现见 ai-sdk-model-gateway.ts（真实）/ sim-model-gateway.ts（模拟）。
 */
export interface ModelStreamChunk {
  text: string;
}

export interface ModelGateway {
  stream(
    input: string,
    opts?: { modelId?: string },
  ): AsyncIterable<ModelStreamChunk>;
}

export const MODEL_GATEWAY = Symbol('MODEL_GATEWAY');
