/**
 * ModelGateway 抽象与注入 token（与实现分离，避免测试链路引入 ai-sdk ESM 依赖）。
 *
 * Run 链路的模型调用抽象，对应 worker-design-reference.md 5.2 的
 * StepExecutor/ModelCall：Worker 不直接依赖 ai-sdk 与 provider 配置，
 * 只依赖本接口；实现见 ai-sdk-model-gateway.ts（真实）/ sim-model-gateway.ts（模拟）。
 *
 * 工具循环（最小 Agent Loop）：模型请求工具后由 RunRunner 提交 tool.requested，
 * 工具结果回喂为下一条 tool 消息，循环直到模型输出无 tool_use 的最终消息。
 */
export interface ModelToolCall {
  /** 模型侧工具调用 ID（跨轮唯一，兼作 ToolCall.idempotencyKey）。 */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** 与实现无关的对话消息（网关内部转换为 provider 原生格式）。 */
export type ModelMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: ModelToolCall[] }
  | { role: 'tool'; toolCallId: string; result: unknown };

/** 暴露给模型的工具定义（inputSchema 为 zod schema，由 ToolRegistry 工具提供）。 */
export interface ModelToolSpec {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ModelGenerateRequest {
  messages: ModelMessage[];
  modelId?: string;
  tools?: ModelToolSpec[];
  /** 文本增量回调（实现侧流式产出时逐段回调，供 RunRunner 攒批落 run.output_delta）。 */
  onDelta?: (text: string) => void | Promise<void>;
}

export interface ModelGenerateResult {
  text: string;
  toolCalls: ModelToolCall[];
}

export interface ModelGateway {
  generate(req: ModelGenerateRequest): Promise<ModelGenerateResult>;
}

export const MODEL_GATEWAY = Symbol('MODEL_GATEWAY');
