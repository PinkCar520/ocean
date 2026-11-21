import { createGatewayToolAuthorization } from './core-tool-authorization';
import { PermissionService } from '../skill/permission.service';

describe('Gateway shared tool policy adapter', () => {
 it('preserves layered permission decisions and policy versions', async () => {
  const permissions = {
   evaluateToolDecision: () => ({ action: 'deny' }),
   getPolicyVersion: () => 'gateway-policy-v1',
  } as unknown as PermissionService;
  const authorization = createGatewayToolAuthorization(permissions, '/workspace');
  const context = { runId: 'run', invocationId: 'call', toolName: 'shell', input: {} };
  await expect(authorization.evaluate(context)).resolves.toBe('deny');
  await expect(authorization.policyVersion?.()).resolves.toBe('gateway-policy-v1');
  expect(authorization.approve).toBeUndefined();
 });
});
