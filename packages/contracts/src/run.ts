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
    idempotencyKey: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;
