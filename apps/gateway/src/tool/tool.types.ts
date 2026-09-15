/**
 * ToolRegistry —— 工具注册表（Phase 4 第 4 项：幂等工具调用基础设施）。
 *
 * 对应 docs/architecture/v2/worker-design-reference.md 5.2 StepExecutor.ToolCall：
 * - 工具按 name 注册，execute 由 ToolExecutor 以幂等方式调用；
 * - 有外部副作用的工具（写外部系统）通过 ToolExecutor 的 idempotencyKey
 *   检查保证「相同幂等键只执行一次外部写」；
 * - 未来 PlanLoop / MCP 适配器可动态注册更多工具，界面不变。
 */
export interface ToolContext {
  runId: string;
  userId: string;
}

export interface Tool {
  name: string;
  description: string;
  /**
   * 是否需要人工审批（Phase 4 第 5 项）。为 true 时 ToolExecutor 执行前
   * 先创建 pending 审批并将 Run 置 waiting_for_approval；审批通过后才执行。
   */
  requiresApproval?: boolean;
  /** 执行工具。ctx 提供 Run 上下文（Phase 4 第 8 项起，工具可据此写产物等）。 */
  execute(input: Record<string, unknown>, ctx?: ToolContext): Promise<unknown>;
}

/**
 * TerminalToolError —— 不可重试的业务错误（Phase 4 第 4 项失败分类）。
 * 工具不存在、参数校验失败、权限/egress 拒绝等。抛出后 Run 直接进入
 * failed 终态，消息被确认（不重试），避免对注定失败的工具调用做无意义退避。
 */
export class TerminalToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalToolError';
  }
}

export const TOOL_REGISTRY = Symbol('TOOL_REGISTRY');
