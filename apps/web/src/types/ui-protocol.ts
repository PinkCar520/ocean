// ──────────────────────────────────────────────
// UI Protocol v1 — 前端本地类型定义
// 与 packages/shared/core/src/ui-protocol.ts 保持一致
// ──────────────────────────────────────────────

export type UIComponentType =
  | 'bug_card'
  | 'bug_list'
  | 'pipeline_card'
  | 'task_plan'
  | 'approval_card'
  | 'code_block'
  | 'stats_card'
  | 'text';

export interface UIBase {
  uiType: UIComponentType;
  uiId?: string;
  uiMeta?: Record<string, unknown>;
}

export interface UIBugCardProps {
  id: string;
  title: string;
  status: 'active' | 'resolved' | 'closed';
  assignee: string;
  severity: 'low' | 'medium' | 'high';
  description?: string;
  createdAt?: string;
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
  language?: string;
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
  content: string;
}

export interface UIText extends UIBase {
  uiType: 'text';
  props: UITextProps;
}

export type UIKit =
  | UIBugCard
  | UIBugList
  | UIPipelineCard
  | UITaskPlan
  | UIApprovalCard
  | UICodeBlock
  | UIStatsCard
  | UIText;

export interface ToolResult<T = unknown> {
  data: T;
  ui?: UIKit;
  error?: string;
}
