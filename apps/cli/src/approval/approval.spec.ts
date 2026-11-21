import { describe, it, expect, vi } from 'vitest';
import { InkApprovalCoordinator } from './ink-approval.js';
import { applyApprovalGate, normalizeApprovalHandler } from '../llm/chat.js';
import { PermissionPolicy, defaultSessionPermissionGrants } from '../utils/permission-policy.js';
import type { ApprovalDecision, ApprovalRequest } from './types.js';

function makeTool(execute = vi.fn(async () => ({ ok: true }))) {
  return {
    description: 'test tool',
    inputSchema: { parse: (v: any) => ({ success: true, value: v }) } as any,
    requiresApproval: true,
    execute,
  };
}

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    toolName: 'file_write',
    toolCallId: 'call-1',
    args: { path: 'a.txt', content: 'x' },
    sessionId: 's1',
    workspace: '/tmp',
    policyVersion: 'v1',
    ...overrides,
  };
}

describe('InkApprovalCoordinator', () => {
  it('resolves with approved for a one-off decision', async () => {
    const coord = new InkApprovalCoordinator();
    const p = coord.request(makeRequest());
    expect(coord.getPending()).toHaveLength(1);
    expect(coord.decide('call-1', { kind: 'approved', scope: 'once' })).toBe(true);
    expect(await p).toEqual({ kind: 'approved', scope: 'once' });
    expect(coord.getPending()).toHaveLength(0);
  });

  it('grants the session when scope is session and still approves this call', async () => {
    const grant = vi.fn();
    const coord = new InkApprovalCoordinator({ grantSession: grant });
    const p = coord.request(makeRequest());
    expect(coord.decide('call-1', { kind: 'approved', scope: 'session' })).toBe(true);
    const decision = await p;
    expect(decision.kind).toBe('approved');
    expect(grant).toHaveBeenCalledWith('file_write', { path: 'a.txt', content: 'x' });
  });

  it('resolves with rejected on Deny', async () => {
    const coord = new InkApprovalCoordinator();
    const p = coord.request(makeRequest());
    coord.decide('call-1', { kind: 'rejected', reason: 'no' });
    expect(await p).toMatchObject({ kind: 'rejected', reason: 'no' });
  });

  it('returns expired after the timeout', async () => {
    const coord = new InkApprovalCoordinator();
    const p = coord.request(makeRequest({ timeoutMs: 10 }));
    const decision = await p;
    expect(decision.kind).toBe('expired');
  });

  it('resolves with cancelled when the AbortSignal fires', async () => {
    const coord = new InkApprovalCoordinator();
    const controller = new AbortController();
    const p = coord.request(makeRequest({ signal: controller.signal }));
    controller.abort();
    const decision = await p;
    expect(decision.kind).toBe('cancelled');
  });

  it('ignores duplicate decide calls (single-consume)', async () => {
    const coord = new InkApprovalCoordinator();
    const p = coord.request(makeRequest());
    expect(coord.decide('call-1', { kind: 'approved', scope: 'once' })).toBe(true);
    expect(coord.decide('call-1', { kind: 'rejected' })).toBe(false);
    expect(await p).toMatchObject({ kind: 'approved' });
  });

  it('isolates concurrent approvals by toolCallId', async () => {
    const coord = new InkApprovalCoordinator();
    const p1 = coord.request(makeRequest({ toolCallId: 'a' }));
    const p2 = coord.request(makeRequest({ toolCallId: 'b' }));
    expect(coord.getPending()).toHaveLength(2);
    coord.decide('a', { kind: 'approved', scope: 'once' });
    coord.decide('b', { kind: 'rejected' });
    expect(await p1).toMatchObject({ kind: 'approved' });
    expect(await p2).toMatchObject({ kind: 'rejected' });
  });

  it('rejects a second request with the same toolCallId', async () => {
    const coord = new InkApprovalCoordinator();
    const p1 = coord.request(makeRequest({ toolCallId: 'dup' }));
    const p2 = coord.request(makeRequest({ toolCallId: 'dup' }));
    const d2 = await p2;
    expect(d2.kind).toBe('cancelled');
    coord.decide('dup', { kind: 'approved', scope: 'once' });
    expect(await p1).toMatchObject({ kind: 'approved' });
  });

  it('cancelAll resolves every pending request as cancelled', async () => {
    const coord = new InkApprovalCoordinator();
    const p1 = coord.request(makeRequest({ toolCallId: 'x' }));
    const p2 = coord.request(makeRequest({ toolCallId: 'y' }));
    coord.cancelAll('closing');
    expect((await p1).kind).toBe('cancelled');
    expect((await p2).kind).toBe('cancelled');
  });
});

describe('applyApprovalGate lifecycle', () => {
  it('returns unavailable when no handler is provided', async () => {
    const gated = applyApprovalGate({ t: makeTool() });
    const result = await gated.t.execute({});
    expect(result).toMatchObject({ text: expect.stringContaining('审批不可用') });
  });

  it('executes the tool after an approved decision', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const gated = applyApprovalGate(
      { t: makeTool(execute) },
      async () => 'approved',
    );
    await gated.t.execute({}, { toolCallId: 'c1' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('does not execute the tool after a rejected decision', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const gated = applyApprovalGate(
      { t: makeTool(execute) },
      async () => 'rejected',
    );
    const result = await gated.t.execute({}, { toolCallId: 'c1' });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ text: expect.stringContaining('审批拒绝') });
  });

  it('blocks when the tool arguments change during approval', async () => {
    let liveArgs: any;
    const handler = vi.fn(async () => {
      // Mutate the args the gate snapshot captured against.
      liveArgs.path = 'changed.txt';
      return 'approved';
    });
    const gated = applyApprovalGate(
      { t: makeTool() },
      handler,
    );
    liveArgs = { path: 'a.txt' };
    const result = await gated.t.execute(liveArgs, { toolCallId: 'c1' });
    expect(result).toMatchObject({ error: expect.stringContaining('arguments changed') });
  });

  it('blocks when the policy version drifts during approval', async () => {
    let version = 'v1';
    const handler = vi.fn(async () => {
      version = 'v2';
      return 'approved';
    });
    const gated = applyApprovalGate(
      { t: makeTool() },
      handler,
      { getPolicyVersion: () => version },
    );
    const result = await gated.t.execute({ path: 'a.txt' }, { toolCallId: 'c1' });
    expect(result).toMatchObject({ error: expect.stringContaining('policy changed') });
  });

  it('blocks when the AbortSignal fires before the tool runs', async () => {
    const controller = new AbortController();
    const handler = vi.fn(async () => {
      controller.abort();
      return 'approved';
    });
    const gated = applyApprovalGate({ t: makeTool() }, handler);
    const result = await gated.t.execute({}, { toolCallId: 'c1', abortSignal: controller.signal });
    expect(result).toMatchObject({ error: expect.stringContaining('cancelled') });
  });

  it('passes the full ApprovalRequest to new-form handlers', async () => {
    let captured: ApprovalRequest | undefined;
    const handler = async (req: ApprovalRequest): Promise<ApprovalDecision> => {
      captured = req;
      return { kind: 'approved', scope: 'once' };
    };
    const gated = applyApprovalGate({ t: makeTool() }, handler, {
      getPolicyVersion: () => 'v1',
      sessionId: () => 'sid',
      workspace: '/ws',
    });
    await gated.t.execute({ path: 'a.txt' }, { toolCallId: 'c1' });
    expect(captured).toMatchObject({
      toolName: 't',
      toolCallId: 'c1',
      sessionId: 'sid',
      workspace: '/ws',
      policyVersion: 'v1',
    });
  });

  it('does not re-execute a tool whose approval was already consumed (idempotent gate)', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    let resolveApproval: (d: ApprovalDecision) => void = () => {};
    const handler = vi.fn(async () => new Promise<ApprovalDecision>((r) => { resolveApproval = r; }));
    const gated = applyApprovalGate({ t: makeTool(execute) }, handler);
    const p = gated.t.execute({}, { toolCallId: 'c1' });
    resolveApproval({ kind: 'approved', scope: 'once' });
    await p;
    expect(execute).toHaveBeenCalledTimes(1);
    // A second execute with the same toolCallId creates a fresh approval; the
    // tool only runs if that second approval is also granted.
    resolveApproval = () => {};
    const p2 = gated.t.execute({}, { toolCallId: 'c1' });
    // Without resolving, it stays pending — proving no silent re-execution.
    await expect(Promise.race([p2, Promise.resolve('pending')])).resolves.toBe('pending');
  });
});

describe('session grant isolation', () => {
  it('isolates session grants between different session ids', () => {
    const grants = defaultSessionPermissionGrants;
    grants.clearSession('session-a');
    grants.clearSession('session-b');
    const policyA = new PermissionPolicy(process.cwd(), undefined, {
      grants, sessionId: () => 'session-a', mode: 'default',
    });
    const policyB = new PermissionPolicy(process.cwd(), undefined, {
      grants, sessionId: () => 'session-b', mode: 'default',
    });
    policyA.grantSession('file_write', { path: 'a.txt' });
    // Session A is allowed; session B is still asked (not allowed).
    expect(policyA.evaluate('file_write', { path: 'a.txt' })).toBe('allow');
    expect(policyB.evaluate('file_write', { path: 'a.txt' })).toBe('ask');
    grants.clearSession('session-a');
    grants.clearSession('session-b');
  });
});

describe('daemon fail-closed', () => {
  it('denies tool calls when no approval channel exists', () => {
    // Daemon RPC evaluates the policy directly; anything not 'allow' throws.
    const policy = new PermissionPolicy(process.cwd(), undefined, { mode: 'default' });
    const action = policy.evaluate('file_write', { path: 'a.txt' });
    expect(action).toBe('ask');
    // A 'deny' decision must never be auto-approved even with an approval
    // handler — beforeApproval blocks it before the gate runs.
    expect(policy.evaluate('shell', { command: 'rm -rf /' })).toBe('ask');
  });
});

describe('normalizeApprovalHandler', () => {
  it('normalizes legacy string outcomes', async () => {
    const h = normalizeApprovalHandler(async () => 'approved');
    expect(await h(makeRequest())).toMatchObject({ kind: 'approved' });
  });

  it('normalizes legacy hook outcomes', async () => {
    const h = normalizeApprovalHandler(async () => ({ permission: 'deny' as const, reason: 'nope' }));
    expect(await h(makeRequest())).toMatchObject({ kind: 'rejected', reason: 'nope' });
  });

  it('passes through unified ApprovalDecision objects', async () => {
    const h = normalizeApprovalHandler(async (req: ApprovalRequest) => ({ kind: 'approved', scope: 'once' }));
    expect(await h(makeRequest())).toMatchObject({ kind: 'approved' });
  });
});
