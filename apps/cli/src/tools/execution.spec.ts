import { expect, it } from 'vitest';
import { z } from 'zod';
import { executeTool } from './base.js';

const context = { cwd: process.cwd(), userId: 'u', sessionId: 's', toolCallId: 'call' };
it('validates before execution and supplies canonical context', async () => {
  const tool = { name: 'test', inputSchema: z.object({ value: z.string() }), execute: async (_: unknown, ctx: any) => ({ data: ctx.workspaceRoot }) };
  expect(await executeTool(tool, {}, context)).toMatchObject({ errorCode: 'validation' });
  expect(await executeTool(tool, { value: 'ok' }, context)).toEqual({ data: context.cwd });
});
it('classifies failures and prevents cancelled execution', async () => {
  const tool = { name: 'test', execute: async () => { throw new Error('failed'); } };
  expect(await executeTool(tool, {}, context)).toMatchObject({ error: 'failed', errorCode: 'execution' });
  const controller = new AbortController(); controller.abort();
  expect(await executeTool(tool, {}, { ...context, signal: controller.signal })).toMatchObject({ errorCode: 'cancelled' });
});

it('keeps Agent and RPC read results and invalid-input failures consistent', async () => {
  const { toAgentToolSet } = await import('./index.js');
  const { createNotebookRpc } = await import('./notebook-rpc.js');
  const agent = await toAgentToolSet(context);
  const rpc = createNotebookRpc(context.cwd);
  const input = { path: 'package.json', limit: 1 };
  const result = await agent.file_read.execute(input, {});
  expect(await rpc('file_read', { ...input, sessionId: context.sessionId }, context.userId)).toEqual(result.data);
  const invalid = await agent.file_read.execute({ ...input, limit: 1001 }, {});
  expect(invalid.errorCode).toBe('validation');
  await expect(rpc('file_read', { ...input, limit: 1001, sessionId: context.sessionId }, context.userId)).rejects.toThrow('Invalid file read');
});
