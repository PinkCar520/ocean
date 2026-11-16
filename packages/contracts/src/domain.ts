import { z } from 'zod';

/**
 * Runtime bindings for schemas/domain.schema.json — the single source of
 * truth shared by Ocean (TypeScript) and OLO (Python/Swift).
 *
 * Keep this file structurally aligned with the JSON Schema `$defs`; the
 * drift test in domain.spec.ts fails when the two diverge.
 */

const rfc3339Schema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'invalid RFC 3339 timestamp',
  });

export const sensitivitySchema = z.enum([
  'public',
  'personal',
  'sensitive',
  'restricted',
]);

export const observationSourceSchema = z
  .object({
    provider: z.string().min(1),
    bodyId: z.string().min(1),
    sourceRef: z.string().min(1),
  })
  .strict();

export const observationSchema = z
  .object({
    id: z.string().regex(/^obs_/),
    schemaVersion: z.literal(1),
    subjectId: z.string().min(1),
    kind: z.string().min(1),
    payload: z.record(z.string(), z.string()),
    source: observationSourceSchema,
    observedAt: rfc3339Schema,
    receivedAt: rfc3339Schema,
    validUntil: rfc3339Schema.nullable().optional(),
    confidence: z.number().min(0).max(1),
    sensitivity: sensitivitySchema,
    permissionScope: z.string().min(1),
  })
  .strict();

export const intentSchema = z
  .object({
    id: z.string().regex(/^task_/),
    subjectId: z.string().min(1),
    rawIntent: z.string().min(1),
  })
  .strict();

export const capabilitySchema = z
  .object({
    capability: z.string().min(1),
    execution: z.enum(['device', 'server']),
    sideEffect: z.enum(['read', 'reversible_write', 'irreversible_write']),
    supportsIdempotency: z.boolean(),
    supportsQuery: z.boolean(),
    supportsCancel: z.boolean(),
  })
  .strict();

export const permissionDecisionSchema = z
  .object({
    subjectId: z.string().min(1),
    capability: z.string().min(1),
    purpose: z.string().min(1),
    planRevision: z.number().int().min(1),
    decision: z.enum(['allow', 'confirmed', 'authenticated', 'deny']),
    reason: z.string(),
  })
  .strict();

export const actionCreateSchema = z
  .object({
    id: z.string().regex(/^act_/),
    requestId: z.string().min(1),
    subjectId: z.string().min(1),
    taskId: z.string().regex(/^task_/),
    planId: z.string().regex(/^plan_/),
    planRevision: z.number().int().min(1),
    capability: z.string().min(1),
    arguments: z.record(z.string(), z.string()),
    permissionDecision: z.string().min(1),
  })
  .strict();

export const actionResultSchema = z
  .object({
    status: z.string().min(1),
    providerRef: z.string().nullable().optional(),
    evidence: z.record(z.string(), z.string()),
    summary: z.string(),
  })
  .strict();

export const actionStatusSchema = z.enum([
  'prepared',
  'submitted',
  'accepted',
  'rejected',
  'outcome_unknown',
  'completed',
  'verified',
]);

export const actionReceiptSchema = z
  .object({
    actionId: z.string().regex(/^act_/),
    requestId: z.string().min(1),
    capability: z.string().min(1),
    status: actionStatusSchema,
    summary: z.string(),
    evidence: z.record(z.string(), z.string()),
    providerRef: z.string().nullable().optional(),
  })
  .strict();

export type SensitivityContract = z.infer<typeof sensitivitySchema>;
export type ObservationSourceContract = z.infer<typeof observationSourceSchema>;
export type ObservationContract = z.infer<typeof observationSchema>;
export type IntentContract = z.infer<typeof intentSchema>;
export type CapabilityContract = z.infer<typeof capabilitySchema>;
export type PermissionDecisionContract = z.infer<
  typeof permissionDecisionSchema
>;
export type ActionCreateContract = z.infer<typeof actionCreateSchema>;
export type ActionResultContract = z.infer<typeof actionResultSchema>;
export type ActionStatusContract = z.infer<typeof actionStatusSchema>;
export type ActionReceiptContract = z.infer<typeof actionReceiptSchema>;
