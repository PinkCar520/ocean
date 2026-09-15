import { z } from 'zod';

import { spaceRefSchema } from './space.js';

export const runStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_for_approval',
  'waiting_for_input',
  'paused',
  'succeeded',
  'failed',
  'cancelled',
]);

export type RunStatus = z.infer<typeof runStatusSchema>;

/** 运行优先级三档（Phase 4 第 6 项，借鉴 K3）：critical 用户交互立即调度，interactive 正常，background 闲时。 */
export const runPrioritySchema = z.enum(['critical', 'interactive', 'background']);

export type RunPriority = z.infer<typeof runPrioritySchema>;

export const agentRunSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    space: spaceRefSchema,
    input: z.string().min(1),
    status: runStatusSchema,
    priority: runPrioritySchema,
    idempotencyKey: z.string().min(1).nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type AgentRun = z.infer<typeof agentRunSchema>;

export const toolCallSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string().min(1).optional(),
  })
  .strict();

export type ToolCall = z.infer<typeof toolCallSchema>;

export const approvalSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    toolCallId: z.string().min(1),
    status: z.enum(['pending', 'approved', 'rejected', 'expired']),
    decidedBy: z.string().min(1).optional(),
    decidedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type Approval = z.infer<typeof approvalSchema>;

/** 审批决策请求：人工在端点提交 approved / rejected（Phase 4 第 5 项）。 */
export const approvalDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
  })
  .strict();

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const artifactSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    kind: z.string().min(1),
    name: z.string().min(1),
    contentType: z.string().min(1),
    uri: z.string().min(1),
    size: z.number().int().nonnegative().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type Artifact = z.infer<typeof artifactSchema>;

export const runStepKindSchema = z.enum([
  'model_call',
  'tool_call',
  'approval',
  'artifact',
]);

export type RunStepKind = z.infer<typeof runStepKindSchema>;

export const runStepStatusSchema = z.enum([
  'started',
  'succeeded',
  'failed',
  'interrupted',
]);

export type RunStepStatus = z.infer<typeof runStepStatusSchema>;

export const runStepSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    seq: z.number().int().nonnegative(),
    kind: runStepKindSchema,
    status: runStepStatusSchema,
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.string().optional(),
    checkpoint: z.record(z.string(), z.unknown()).optional(),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type RunStep = z.infer<typeof runStepSchema>;

const runEventBase = {
  id: z.string().min(1),
  runId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  occurredAt: z.string().datetime({ offset: true }),
};

export const runEventSchema = z.discriminatedUnion('type', [
  z.object({ ...runEventBase, type: z.literal('run.created'), status: z.literal('queued') }).strict(),
  z.object({ ...runEventBase, type: z.literal('run.status_changed'), status: runStatusSchema }).strict(),
  z.object({ ...runEventBase, type: z.literal('run.output_delta'), delta: z.string() }).strict(),
  z.object({ ...runEventBase, type: z.literal('run.step_started'), step: runStepSchema }).strict(),
  z.object({ ...runEventBase, type: z.literal('run.step_completed'), step: runStepSchema }).strict(),
  z.object({ ...runEventBase, type: z.literal('tool.requested'), toolCall: toolCallSchema }).strict(),
  z.object({ ...runEventBase, type: z.literal('tool.completed'), toolCallId: z.string().min(1), result: z.unknown() }).strict(),
  z.object({ ...runEventBase, type: z.literal('approval.requested'), approval: approvalSchema }).strict(),
  z.object({ ...runEventBase, type: z.literal('artifact.created'), artifact: artifactSchema }).strict(),
  z.object({ ...runEventBase, type: z.literal('run.failed'), code: z.string().min(1), message: z.string() }).strict(),
]);

export type RunEvent = z.infer<typeof runEventSchema>;

export const createRunRequestSchema = z
  .object({
    space: spaceRefSchema,
    input: z.string().min(1),
    priority: runPrioritySchema.optional(),
    idempotencyKey: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const runSnapshotSchema = z
  .object({
    run: agentRunSchema,
    events: z.array(runEventSchema),
  })
  .strict();

export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

export const runRequestedMessageSchema = z
  .object({
    version: z.literal(1),
    runId: z.string().min(1),
    userId: z.string().min(1),
  })
  .strict();

export type RunRequestedMessage = z.infer<typeof runRequestedMessageSchema>;

export const toolRequestedMessageSchema = z
  .object({
    version: z.literal(1),
    runId: z.string().min(1),
    userId: z.string().min(1),
    toolCall: toolCallSchema,
  })
  .strict();

export type ToolRequestedMessage = z.infer<typeof toolRequestedMessageSchema>;

export const leasedRunJobSchema = z.discriminatedUnion('topic', [
  z
    .object({
      id: z.string().min(1),
      topic: z.literal('run.requested'),
      payload: runRequestedMessageSchema,
      attempts: z.number().int().positive(),
      lockedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      topic: z.literal('tool.requested'),
      payload: toolRequestedMessageSchema,
      attempts: z.number().int().positive(),
      lockedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
]);

export type LeasedRunJob = z.infer<typeof leasedRunJobSchema>;
