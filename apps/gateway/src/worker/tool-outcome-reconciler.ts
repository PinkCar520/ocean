import { Prisma, PrismaClient } from '@prisma/client';

/**
 * A trusted, query-only provider adapter. Implementations MUST NOT invoke the
 * original operation: reconciliation cannot safely repeat external side effects.
 */
export interface ToolOutcomeQueryAdapter {
  query(identity: {
    runId: string;
    stepId: string;
    toolName: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
  }): Promise<
    | { status: 'unknown' }
    | { status: 'succeeded'; idempotencyKey: string; output: unknown }
    | { status: 'failed'; idempotencyKey: string; error: string }
  >;
}

export type ReconciliationStatus = 'unknown' | 'succeeded' | 'failed' | 'unsupported' | 'conflict';

/**
 * Reconciles persisted outcome-unknown steps without calling tool.execute.
 * Callers can schedule this for unknown steps after a worker interruption.
 * Only provider-verified terminal receipts may change the step; the enclosing
 * Run remains failed until a separate, explicit recovery policy is applied.
 */
export class ToolOutcomeReconciler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapters: ReadonlyMap<string, ToolOutcomeQueryAdapter>,
  ) {}

  async reconcile(stepId: string): Promise<ReconciliationStatus> {
    const step = await this.prisma.runStep.findUnique({ where: { id: stepId } });
    if (!step) return 'unsupported';
    if (step.status === 'succeeded' || step.status === 'failed') return step.status;
    if (step.kind !== 'tool_call' || step.status !== 'unknown' || !step.idempotencyKey) return 'unsupported';
    const payload = step.input;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'unsupported';
    const toolName = (payload as Record<string, unknown>).name;
    const input = (payload as Record<string, unknown>).input;
    if (typeof toolName !== 'string' || !input || typeof input !== 'object' || Array.isArray(input)) return 'unsupported';
    const adapter = this.adapters.get(toolName);
    if (!adapter) return 'unsupported';
    const proof = await adapter.query({
      runId: step.runId, stepId: step.id, toolName,
      idempotencyKey: step.idempotencyKey,
      input: input as Record<string, unknown>,
    });
    if (proof.status === 'unknown') return 'unknown';
    if (proof.idempotencyKey !== step.idempotencyKey) {
      throw new Error('Provider outcome idempotency key mismatch');
    }
    const data = proof.status === 'succeeded'
      ? { status: 'succeeded' as const, output: JSON.parse(JSON.stringify(proof.output ?? null)) as Prisma.InputJsonValue, error: null, completedAt: new Date() }
      : { status: 'failed' as const, error: proof.error, completedAt: new Date() };
    const changed = await this.prisma.runStep.updateMany({
      where: { id: step.id, runId: step.runId, status: 'unknown', idempotencyKey: step.idempotencyKey },
      data,
    });
    return changed.count === 1 ? proof.status : 'conflict';
  }
}
