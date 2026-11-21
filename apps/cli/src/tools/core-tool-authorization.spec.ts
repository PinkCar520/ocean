import { describe, expect, it } from 'vitest';
import { createCliToolAuthorization } from './core-tool-authorization.js';
import type { PermissionPolicy } from '../utils/permission-policy.js';

describe('CLI shared Tool Runtime policy adapter', () => {
 it('uses the existing policy decision and version without granting privileges', async () => {
  const policy = {
   evaluate: (name: string) => name === 'file_read' ? 'allow' : 'deny',
   getPolicyVersion: () => 'policy-v1',
  } as PermissionPolicy;
  const authorization = createCliToolAuthorization(policy);
  const context = { runId: 'run', invocationId: 'call', toolName: 'shell', input: {} };
  await expect(authorization.evaluate(context)).resolves.toBe('deny');
  await expect(authorization.policyVersion?.()).resolves.toBe('policy-v1');
  expect(authorization.approve).toBeUndefined();
 });
 it('honors tools requiring approval despite a base allow', async () => {
  const policy = { evaluate: () => 'allow', getPolicyVersion: () => 'v1' } as unknown as PermissionPolicy;
  const authorization = createCliToolAuthorization(policy, async () => true, {
   file_write: { requiresApproval: () => true },
  });
  await expect(authorization.evaluate({ runId: 'r', invocationId: 'c', toolName: 'file_write', input: {} }))
   .resolves.toBe('ask');
 });
 it('rejects tool-specific safety blocks even when policy allows execution', async () => {
  const policy = { evaluate: () => 'allow', getPolicyVersion: () => 'v1' } as unknown as PermissionPolicy;
  const authorization = createCliToolAuthorization(policy, undefined, {
   bash: { beforeApproval: async () => 'Plan mode is active' },
  });
  await expect(authorization.evaluate({ runId: 'r', invocationId: 'c', toolName: 'bash', input: {} }))
   .resolves.toBe('deny');
 });
 it('fails closed if a tool approval predicate throws', async () => {
  const policy = { evaluate: () => 'allow', getPolicyVersion: () => 'v1' } as unknown as PermissionPolicy;
  const authorization = createCliToolAuthorization(policy, undefined, {
   bash: { requiresApproval: () => { throw new Error('bad predicate'); } },
  });
  await expect(authorization.evaluate({ runId: 'r', invocationId: 'c', toolName: 'bash', input: {} }))
   .resolves.toBe('ask');
 });

});
