import { Injectable } from '@nestjs/common';
import { InteractiveManager } from '../skill/interactive.manager';

/**
 * PolicyEvaluator —— 工具执行策略判定（Agent Runtime 第 5/6 模块）。
 * 从原 SkillOrchestrator / InteractiveManager 拆分出「决策层」：
 * - shouldWrap：查询能力注册表（@ocean/contracts 的 Capability 契约），
 *   判定某工具是否需要审批/权限拦截（高危门）。
 * - wrap：委托 InteractiveManager 的阻断实现包装工具定义。
 *
 * 决策不再硬编码工具名：能力属性集中在 tool/capability.registry.ts，
 * 与共享契约 packages/contracts/schemas/domain.schema.json 对齐。
 */
@Injectable()
export class PolicyEvaluator {
  constructor(private readonly interactiveManager: InteractiveManager) {}

  /**
   * 判定工具是否需要审批拦截。
   * MCP 工具默认拦截（保守策略）；已注册工具使用其 defaultDecision；
   * 未注册工具默认要求审批。
   */
  shouldWrap(toolName: string, isMcp: boolean): boolean {
    // Every tool needs a runtime check: even read-only tools can be denied.
    return true;
  }

  /** 委托 InteractiveManager 生成审批拦截包装。 */
  wrap(toolName: string, toolDef: any, sessionId: string, userId: string): any {
    return this.interactiveManager.wrapHighRiskTool(
      toolName,
      toolDef,
      sessionId,
      userId,
    );
  }
}
