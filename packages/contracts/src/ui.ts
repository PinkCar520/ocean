import { z } from 'zod';

export const uiComponentTypeSchema = z.enum([
  'bug_card', 'bug_list', 'pipeline_card', 'task_plan', 'approval_card', 'code_block',
  'stats_card', 'text', 'zentao_task_card', 'leave_request_form', 'diff_viewer',
  'print_console', 'inquiry_card',
]);
export type UIComponentType = z.infer<typeof uiComponentTypeSchema>;

const uiBaseShape = {
  uiId: z.string().min(1).optional(),
  uiMeta: z.record(z.string(), z.unknown()).optional(),
};

export const uiAttachmentSchema = z.object({
  url: z.string().min(1), name: z.string().optional(), contentType: z.string().optional(),
  size: z.number().nonnegative().optional(), extension: z.string().optional(),
});
export type UIAttachment = z.infer<typeof uiAttachmentSchema>;

export const uiBugCardPropsSchema = z.object({
  id: z.string(), title: z.string(), status: z.enum(['active', 'resolved', 'closed']),
  assignee: z.string(), severity: z.enum(['low', 'medium', 'high']),
  description: z.string().optional(), createdAt: z.string().optional(),
  attachments: z.array(uiAttachmentSchema).optional(),
});
export type UIBugCardProps = z.infer<typeof uiBugCardPropsSchema>;
export const uiBugCardSchema = z.object({ ...uiBaseShape, uiType: z.literal('bug_card'), props: uiBugCardPropsSchema });
export type UIBugCard = z.infer<typeof uiBugCardSchema>;

export const uiBugListPropsSchema = z.object({ items: z.array(uiBugCardPropsSchema), title: z.string().optional() });
export type UIBugListProps = z.infer<typeof uiBugListPropsSchema>;
export const uiBugListSchema = z.object({ ...uiBaseShape, uiType: z.literal('bug_list'), props: uiBugListPropsSchema });
export type UIBugList = z.infer<typeof uiBugListSchema>;

export const uiStepSchema = z.object({
  name: z.string(), status: z.enum(['success', 'running', 'waiting', 'failed']), duration: z.string().optional(),
});
export type UIStep = z.infer<typeof uiStepSchema>;
export const uiPipelineCardPropsSchema = z.object({
  id: z.string(), name: z.string(), branch: z.string(),
  status: z.enum(['success', 'running', 'failed', 'paused']), steps: z.array(uiStepSchema),
  startTime: z.string(), logsUrl: z.string().optional(),
});
export type UIPipelineCardProps = z.infer<typeof uiPipelineCardPropsSchema>;
export const uiPipelineCardSchema = z.object({ ...uiBaseShape, uiType: z.literal('pipeline_card'), props: uiPipelineCardPropsSchema });
export type UIPipelineCard = z.infer<typeof uiPipelineCardSchema>;

export const uiTaskStepSchema = z.object({ label: z.string(), tool: z.string(), description: z.string() });
export type UITaskStep = z.infer<typeof uiTaskStepSchema>;
export const uiTaskPlanPropsSchema = z.object({ title: z.string(), steps: z.array(uiTaskStepSchema), actionId: z.string() });
export type UITaskPlanProps = z.infer<typeof uiTaskPlanPropsSchema>;
export const uiTaskPlanSchema = z.object({ ...uiBaseShape, uiType: z.literal('task_plan'), props: uiTaskPlanPropsSchema });
export type UITaskPlan = z.infer<typeof uiTaskPlanSchema>;

export const uiApprovalCardPropsSchema = z.object({
  requestId: z.string(), toolName: z.string(), description: z.string(),
  args: z.record(z.string(), z.unknown()).optional(), status: z.enum(['pending', 'approved', 'rejected']),
});
export type UIApprovalCardProps = z.infer<typeof uiApprovalCardPropsSchema>;
export const uiApprovalCardSchema = z.object({ ...uiBaseShape, uiType: z.literal('approval_card'), props: uiApprovalCardPropsSchema });
export type UIApprovalCard = z.infer<typeof uiApprovalCardSchema>;

export const uiCodeBlockPropsSchema = z.object({
  command: z.string().optional(), output: z.string(), status: z.enum(['success', 'error']), language: z.string().optional(),
});
export type UICodeBlockProps = z.infer<typeof uiCodeBlockPropsSchema>;
export const uiCodeBlockSchema = z.object({ ...uiBaseShape, uiType: z.literal('code_block'), props: uiCodeBlockPropsSchema });
export type UICodeBlock = z.infer<typeof uiCodeBlockSchema>;

export const uiStatsMetricSchema = z.object({
  label: z.string(), value: z.union([z.string(), z.number()]), trend: z.enum(['up', 'down', 'neutral']).optional(),
});
export type UIStatsMetric = z.infer<typeof uiStatsMetricSchema>;
export const uiStatsCardPropsSchema = z.object({ title: z.string(), metrics: z.array(uiStatsMetricSchema) });
export type UIStatsCardProps = z.infer<typeof uiStatsCardPropsSchema>;
export const uiStatsCardSchema = z.object({ ...uiBaseShape, uiType: z.literal('stats_card'), props: uiStatsCardPropsSchema });
export type UIStatsCard = z.infer<typeof uiStatsCardSchema>;

export const uiTextPropsSchema = z.object({ content: z.string() });
export type UITextProps = z.infer<typeof uiTextPropsSchema>;
export const uiTextSchema = z.object({ ...uiBaseShape, uiType: z.literal('text'), props: uiTextPropsSchema });
export type UIText = z.infer<typeof uiTextSchema>;

export const uiInquiryStepSchema = z.object({
  id: z.string(), question: z.string(), header: z.string(),
  type: z.enum(['single_select', 'multi_select', 'text']), options: z.array(z.string()).optional(),
});
export type UIInquiryStep = z.infer<typeof uiInquiryStepSchema>;
export const uiInquiryCardPropsSchema = z.object({
  skillName: z.string(), description: z.string().optional(), inquiries: z.array(uiInquiryStepSchema),
  requestId: z.string().optional(), toolName: z.string().optional(),
});
export type UIInquiryCardProps = z.infer<typeof uiInquiryCardPropsSchema>;
export const uiInquiryCardSchema = z.object({ ...uiBaseShape, uiType: z.literal('inquiry_card'), props: uiInquiryCardPropsSchema });
export type UIInquiryCard = z.infer<typeof uiInquiryCardSchema>;

export const zenTaoAssigneeSchema = z.object({ name: z.string(), avatar: z.string().optional() });
export type ZenTaoAssignee = z.infer<typeof zenTaoAssigneeSchema>;
export const uiZenTaoTaskCardPropsSchema = z.object({
  title: z.string(), assignees: z.array(zenTaoAssigneeSchema).optional(), assigneeCount: z.number().int().nonnegative().optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(), assignee: z.string().optional(),
  sprintName: z.string().optional(), sprintStartsIn: z.string().optional(),
});
export type UIZenTaoTaskCardProps = z.infer<typeof uiZenTaoTaskCardPropsSchema>;
export const uiZenTaoTaskCardSchema = z.object({ ...uiBaseShape, uiType: z.literal('zentao_task_card'), props: uiZenTaoTaskCardPropsSchema });
export type UIZenTaoTaskCard = z.infer<typeof uiZenTaoTaskCardSchema>;

export const uiLeaveRequestFormPropsSchema = z.object({
  remainingDays: z.number().optional(), leaveType: z.string().optional(), defaultDates: z.string().optional(),
  quickActions: z.array(z.string()).optional(),
});
export type UILeaveRequestFormProps = z.infer<typeof uiLeaveRequestFormPropsSchema>;
export const uiLeaveRequestFormSchema = z.object({ ...uiBaseShape, uiType: z.literal('leave_request_form'), props: uiLeaveRequestFormPropsSchema });
export type UILeaveRequestForm = z.infer<typeof uiLeaveRequestFormSchema>;

export const uiDiffLineSchema = z.object({
  lineNumber: z.number().int().nonnegative(), type: z.enum(['context', 'addition', 'deletion']), content: z.string(),
});
export type UIDiffLine = z.infer<typeof uiDiffLineSchema>;
export const uiDiffViewerPropsSchema = z.object({
  fileName: z.string(), language: z.string().optional(), draft: z.boolean().optional(), diff: z.array(uiDiffLineSchema),
});
export type UIDiffViewerProps = z.infer<typeof uiDiffViewerPropsSchema>;
export const uiDiffViewerSchema = z.object({ ...uiBaseShape, uiType: z.literal('diff_viewer'), props: uiDiffViewerPropsSchema });
export type UIDiffViewer = z.infer<typeof uiDiffViewerSchema>;

export const uiPrintConsolePropsSchema = z.object({
  printerName: z.string().optional(), location: z.string().optional(), status: z.enum(['online', 'offline', 'busy']).optional(),
  paperPercent: z.number().optional(), paperTray: z.string().optional(),
  inkLevels: z.object({ c: z.number(), m: z.number(), y: z.number(), k: z.number() }).optional(),
  documentName: z.string().optional(), documentPages: z.number().int().nonnegative().optional(), documentSize: z.string().optional(),
  documentGenerated: z.string().optional(), securityPass: z.boolean().optional(), securityMessage: z.string().optional(),
  quickActions: z.array(z.string()).optional(),
});
export type UIPrintConsoleProps = z.infer<typeof uiPrintConsolePropsSchema>;
export const uiPrintConsoleSchema = z.object({ ...uiBaseShape, uiType: z.literal('print_console'), props: uiPrintConsolePropsSchema });
export type UIPrintConsole = z.infer<typeof uiPrintConsoleSchema>;

export const uiKitSchema = z.discriminatedUnion('uiType', [
  uiBugCardSchema, uiBugListSchema, uiPipelineCardSchema, uiTaskPlanSchema, uiApprovalCardSchema,
  uiCodeBlockSchema, uiStatsCardSchema, uiTextSchema, uiZenTaoTaskCardSchema, uiLeaveRequestFormSchema,
  uiDiffViewerSchema, uiPrintConsoleSchema, uiInquiryCardSchema,
]);
export type UIKit = z.infer<typeof uiKitSchema>;
export type UIBase = Pick<UIKit, 'uiType' | 'uiId' | 'uiMeta'>;

export interface ToolResult<T = unknown> { data: T; ui?: UIKit; error?: string }
export const createToolResultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({ data: dataSchema, ui: uiKitSchema.optional(), error: z.string().optional() });
export const toolResultSchema = createToolResultSchema(z.unknown());
