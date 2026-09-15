import { Injectable } from '@nestjs/common';
import { InteractiveManager } from '../skill/interactive.manager';

/**
 * PolicyEvaluator —— 工具执行策略判定（Agent Runtime 第 5/6 模块）。
 * 从原 SkillOrchestrator / InteractiveManager 拆分出「决策层」：
 * - shouldWrap：判定某工具是否需要审批/权限拦截（高危门）。
 * - wrap：委托 InteractiveManager 的阻断实现包装工具定义。
 * 把「哪些工具高危」的判定收口到一处，便于后续接入 PermissionService
 * 规则引擎与 Run Engine 的 approval 门（Phase 4 已建的 run_approvals）。
 */
@Injectable()
export class PolicyEvaluator {
  constructor(private readonly interactiveManager: InteractiveManager) {}

  /** 始终需要审批拦截的高危本地工具。 */
  private readonly alwaysHighRisk = new Set(['local_file_edit', 'local_bash']);

  /**
   * 判定工具是否需要审批拦截。
   * 本地文件写/Shell 执行恒为高危；MCP 工具默认也走审批（保守策略，
   * 与现有 Orchestrator 行为一致：MCP 工具在会话模式下全部 wrap）。
   */
  shouldWrap(toolName: string, isMcp: boolean): boolean {
    if (this.alwaysHighRisk.has(toolName)) return true;
    if (isMcp) return true;
    return false;
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
