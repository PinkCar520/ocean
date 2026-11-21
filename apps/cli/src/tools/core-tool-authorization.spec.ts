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
});
