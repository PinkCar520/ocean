import { AgentExecutionEngine } from '@ocean/core';
import { ToolRegistry } from './tool.registry';
import { createGatewayAgentCore } from './core-agent-runtime';

describe('Gateway Agent Core composition', () => {
 it('constructs the shared execution engine with Gateway-owned adapters', () => {
  const engine = createGatewayAgentCore({
   prisma: {} as any,
   registry: new ToolRegistry(),
   toolContext: { runId: 'run', userId: 'user' },
   model: { next: async () => ({ kind: 'complete', text: 'done' as const }) },
   transcript: { load: async () => [], append: async () => {} },
   completion: { verify: async () => ['host checked'] },
   authorization: { evaluate: async () => 'deny' },
   toMessage: () => ({ role: 'assistant', content: 'done' }),
  });
  expect(engine).toBeInstanceOf(AgentExecutionEngine);
 });
});
