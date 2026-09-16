import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PermissionService } from './permission.service';

/**
 * InteractiveManager
 *
 * 负责人机交互（Human-in-the-loop）的底层管控机制。
 * 收敛了所有的阻断式工具（如：意图澄清、高危操作审批拦截）。
 */
@Injectable()
export class InteractiveManager {
  private readonly logger = new Logger(InteractiveManager.name);

  constructor(
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * 1. 获取意图澄清工具 (Non-blocking 挂起流)
   *
   * 专用于主动收集用户偏好、目标和复杂约束。
   * 该工具执行后立即结束（不阻塞线程），由前端渲染卡片并注入后续的 User Message。
   */
  public getClarifyTool(): Record<string, any> {
    return {
      agp_intent_clarify: tool({
        description: `专门用于在对话中渲染可点击的选项按钮，收集用户偏好或目标。绝对不要在你的回复文本中把这些问题列出来，前端会渲染一个UI卡片来展示这些问题。
调用此工具时，你输出给用户的文本回复必须极度精简（例如只说：“好的，最后确认一下：”），绝对不要解释原因。

【使用约束】（非常重要）：
1. 何时使用：需要收集用户偏好、约束条件、目标，才能给出有用建议时。
2. 何时不用：用户已经提供了足够信息时；用户只是需要一个推荐答案时直接给建议。
3. 结构要求：每次最多问 3 个问题，优先只问 1 个。每个问题必须提供 2-4 个选项，互斥。
4. 题目极其精简：\`question\` 字段必须极其简短直接（例如“文档类型偏向哪种？”），绝对不要使用长句或复杂的解释性文字，这会破坏UI体验。`,
        inputSchema: z.object({
          skillName: z.string().describe('当前触发的技能名称'),
          description: z
            .string()
            .optional()
            .describe('给用户的简短补充说明，非必填'),
          inquiries: z
            .array(
              z.object({
                id: z.string(),
                question: z
                  .string()
                  .describe('完整的提问内容，例如“您期望的文档类型偏向哪种？”'),
                header: z
                  .string()
                  .describe(
                    '用于最终结果呈现的极简短标签（最多 12 个字符），例如“文档类型”',
                  ),
                type: z
                  .enum(['single_select', 'multi_select', 'text'])
                  .describe(
                    '必须尽可能使用 single_select 或 multi_select 并提供选项',
                  ),
                options: z
                  .array(z.string())
                  .optional()
                  .describe('提供 2-4 个互斥选项'),
              }),
            )
            .describe('需要向用户提问的字段列表'),
        }) as any,
        execute: async ({ skillName, description, inquiries }) => {
          this.logger.log(
            `Triggering agp_intent_clarify for skill: ${skillName}`,
          );
          return {
            status: 'WaitingForUser',
            message: '已向用户推送表单，等待用户填写。',
            ui: {
              uiType: 'inquiry_card',
              props: {
                skillName,
                description,
                inquiries,
              },
            },
          };
        },
      }),
    };
  }

  /**
   * 2. 高危工具审批拦截包裹器 (Thread-blocking 轮询流)
   *
   * 用于包裹任何底层的高危 MCP 工具或 Local 工具。
   * 该方法会阻塞当前 Agent 的执行线程（通过 while 轮询数据库），直到用户在前端完成审批。
   *
   * @param toolName 工具名称
   * @param toolDef 工具定义
   * @param sessionId 当前会话 ID
   * @param userId 操作用户 ID
   */
  public wrapHighRiskTool(
    toolName: string,
    toolDef: any,
    sessionId: string,
    userId: string,
  ): any {
    const originalExecute = toolDef.execute;

    return tool({
      ...toolDef,
      execute: async (args: any) => {
        // 权限判定：如果是自动放行的工具，直接执行
        if (this.permissionService.isAutoAllowed(toolName)) {
          return originalExecute(args);
        }

        // 权限判定：如果是明确拒绝的工具，直接抛错
        if (this.permissionService.isDenied(toolName)) {
          throw new Error(`Permission Denied: ${toolName}`);
        }

        this.logger.warn(
          `High-risk tool execution intercepted: ${toolName}. ` +
            `旧直驱链路（CHAT_USE_RUN=false）已停用审批，拒绝执行。请在 Run 模式使用（审批弹在对话窗口）。`,
        );
        return {
          status: 'denied',
          message: `工具 ${toolName} 需要审批。旧直驱链路已停用审批，请使用默认 Run 模式（审批在对话窗口批准）。`,
        };
      },
    });
  }
}
