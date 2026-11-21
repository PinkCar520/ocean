import { ToolRegistry } from './tool.registry';
import { createGatewayToolHost } from './core-tool-host';
import { z } from 'zod';

describe('Gateway Agent Core host adapter', () => {
 it('executes registered remote tools with the bound run and call identity', async () => {
  const registry = new ToolRegistry();
  let observed: unknown;
  registry.register({
   name: 'gateway_test',
   description: 'Host adapter test',
   inputSchema: z.object({ value: z.string() }),
   execute: async (input, context) => { observed = context; return input; },
  });
  const { host, resolveTool } = createGatewayToolHost(registry, { runId: 'run', userId: 'user' });
  const input = await resolveTool('gateway_test')!.validate({ value: 'ok' });
  const invocation = { id: 'call', runId: 'run', toolName: 'gateway_test', input, inputDigest: 'test', host: 'remote' as const };
  await expect(host.execute(invocation)).resolves.toEqual({ value: 'ok' });
  expect(observed).toMatchObject({ runId: 'run', userId: 'user', toolCallId: 'call' });
  await expect(host.execute({ ...invocation, runId: 'foreign' })).rejects.toThrow('context mismatch');
 });
});
