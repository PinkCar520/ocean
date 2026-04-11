// ──────────────────────────────────────────────
// UI Protocol v1 — Generative UI 结构化协议
// ──────────────────────────────────────────────

/** UI 组件类型枚举 */
export type UIComponentType =
  | 'bug_card'       // 缺陷详情卡片
  | 'bug_list'       // 缺陷列表
  | 'pipeline_card'  // 流水线状态卡片
  | 'task_plan'      // 任务规划（含 Y/N 确认）
  | 'approval_card'  // 审批请求卡片
  | 'code_block'     // 代码/命令输出块
  | 'stats_card'     // 统计数据卡片
  | 'text';          // 富文本（Markdown）

/** 通用 UI 组件属性基类 */
export interface UIBase {
  /** 组件类型 */
  uiType: UIComponentType;
  /** 可选：组件唯一 ID，用于 React key */
  uiId?: string;
  /** 可选：渲染时的附加元数据 */
  uiMeta?: Record<string, unknown>;
}

// ── 各类型具体属性 ──

export interface UIAttachment {
  url: string;
  name?: string;
  contentType?: string;
  size?: number;
  extension?: string;
}

export interface UIBugCardProps {
  id: string;
  title: string;
  status: 'active' | 'resolved' | 'closed';
  assignee: string;
  severity: 'low' | 'medium' | 'high';
  description?: string;
  createdAt?: string;
  attachments?: UIAttachment[];
}

export interface UIBugCard extends UIBase {
  uiType: 'bug_card';
  props: UIBugCardProps;
}

export interface UIBugListProps {
  items: UIBugCardProps[];
  title?: string;
}

export interface UIBugList extends UIBase {
  uiType: 'bug_list';
  props: UIBugListProps;
}

export interface UIStep {
  name: string;
  status: 'success' | 'running' | 'waiting' | 'failed';
  duration?: string;
}

export interface UIPipelineCardProps {
  id: string;
  name: string;
  branch: string;
  status: 'success' | 'running' | 'failed' | 'paused';
  steps: UIStep[];
  startTime: string;
  /** 可选：日志查看 URL */
  logsUrl?: string;
}

export interface UIPipelineCard extends UIBase {
  uiType: 'pipeline_card';
  props: UIPipelineCardProps;
}

export interface UITaskStep {
  label: string;
  tool: string;
  description: string;
}

export interface UITaskPlanProps {
  title: string;
  steps: UITaskStep[];
  /** 确认/拒绝回调的标识，由前端映射为 sendMessage */
  actionId: string;
}

export interface UITaskPlan extends UIBase {
  uiType: 'task_plan';
  props: UITaskPlanProps;
}

export interface UIApprovalCardProps {
  requestId: string;
  toolName: string;
  description: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
}

export interface UIApprovalCard extends UIBase {
  uiType: 'approval_card';
  props: UIApprovalCardProps;
}

export interface UICodeBlockProps {
  command?: string;
  output: string;
  status: 'success' | 'error';
  language?: string; // 默认 'bash'
}

export interface UICodeBlock extends UIBase {
  uiType: 'code_block';
  props: UICodeBlockProps;
}

export interface UIStatsMetric {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
}

export interface UIStatsCardProps {
  title: string;
  metrics: UIStatsMetric[];
}

export interface UIStatsCard extends UIBase {
  uiType: 'stats_card';
  props: UIStatsCardProps;
}

export interface UITextProps {
  content: string; // Markdown 格式
}

export interface UIText extends UIBase {
  uiType: 'text';
  props: UITextProps;
}

/** 所有 UI Kit 类型的联合类型 */
export type UIKit =
  | UIBugCard
  | UIBugList
  | UIPipelineCard
  | UITaskPlan
  | UIApprovalCard
  | UICodeBlock
  | UIStatsCard
  | UIText;

/** 工具返回结果的标准格式（Gen 2 新增 ui 字段） */
export interface ToolResult<T = unknown> {
  /** 工具原始执行结果 */
  data: T;
  /** 可选：UI 描述（Gen 2 新增）。存在时前端走 UIRenderer，不存在时回退到旧逻辑 */
  ui?: UIKit;
  /** 可选：错误信息 */
  error?: string;
}
