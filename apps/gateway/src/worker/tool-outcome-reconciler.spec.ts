import { ToolOutcomeReconciler, type ToolOutcomeQueryAdapter } from './tool-outcome-reconciler';

const identity = { runId: 'run-1', stepId: 'step-1', toolName: 'external.write', idempotencyKey: 'key-1', input: { path: '/tmp/a' } };
function setup() {
  const step = { id: identity.stepId, runId: identity.runId, kind: 'tool_call', status: 'unknown', idempotencyKey: identity.idempotencyKey, input: { name: identity.toolName, input: identity.input, idempotencyKey: identity.idempotencyKey }, output: null };
  const tx = {
    runStep: {
      findUnique: jest.fn().mockResolvedValue(step),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = { runStep: tx.runStep, $transaction: jest.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx)) };
  const adapter: ToolOutcomeQueryAdapter = { query: jest.fn().mockResolvedValue({ status: 'unknown' }) };
  return { reconciler: new ToolOutcomeReconciler(prisma as never, new Map([[identity.toolName, adapter]])), adapter, tx, step };
}

describe('external tool outcome reconciliation', () => {
  it('records a proven completed result without re-executing a side effect', async () => {
    const { reconciler, adapter, tx } = setup();
    (adapter.query as jest.Mock).mockResolvedValue({ status: 'succeeded', idempotencyKey: identity.idempotencyKey, output: { receipt: 'r-1' } });
    expect(await reconciler.reconcile(identity.stepId)).toBe('succeeded');
    expect(adapter.query).toHaveBeenCalledWith(identity);
    expect(tx.runStep.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: identity.stepId, runId: identity.runId, status: 'unknown', idempotencyKey: identity.idempotencyKey },
      data: expect.objectContaining({ status: 'succeeded', output: { receipt: 'r-1' } }),
    }));
  });

  it('keeps unknown outcome when provider cannot prove completion, including lost responses', async () => {
    const { reconciler, adapter, tx } = setup();
    expect(await reconciler.reconcile(identity.stepId)).toBe('unknown');
    expect(tx.runStep.updateMany).not.toHaveBeenCalled();
    (adapter.query as jest.Mock).mockRejectedValueOnce(new Error('provider disconnected'));
    await expect(reconciler.reconcile(identity.stepId)).rejects.toThrow('provider disconnected');
    expect(tx.runStep.updateMany).not.toHaveBeenCalled();
  });

  it('rejects mismatched provider receipts and refuses to reconcile a duplicate schedule', async () => {
    const { reconciler, adapter, tx } = setup();
    (adapter.query as jest.Mock).mockResolvedValue({ status: 'succeeded', idempotencyKey: 'another-key', output: { receipt: 'r-2' } });
    await expect(reconciler.reconcile(identity.stepId)).rejects.toThrow('idempotency');
    expect(tx.runStep.updateMany).not.toHaveBeenCalled();
    (adapter.query as jest.Mock).mockResolvedValue({ status: 'succeeded', idempotencyKey: identity.idempotencyKey, output: { receipt: 'r-1' } });
    tx.runStep.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await reconciler.reconcile(identity.stepId)).toBe('conflict');
    expect(tx.runStep.updateMany).toHaveBeenCalledTimes(1);
  });

  it('never queries a provider for a completed or unkeyed tool step', async () => {
    const { reconciler, adapter, tx, step } = setup();
    tx.runStep.findUnique.mockResolvedValueOnce({ ...step, status: 'succeeded' });
    expect(await reconciler.reconcile(identity.stepId)).toBe('succeeded');
    tx.runStep.findUnique.mockResolvedValueOnce({ ...step, idempotencyKey: null });
    expect(await reconciler.reconcile(identity.stepId)).toBe('unsupported');
    expect(adapter.query).not.toHaveBeenCalled();
  });
});
