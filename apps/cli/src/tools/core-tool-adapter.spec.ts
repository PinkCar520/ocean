import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCliToolHost } from './core-tool-adapter.js';

describe('CLI shared tool runtime adapter', () => {
 it('validates inputs and executes through the local host', async () => {
  let calls = 0;
  const adapter = createCliToolHost({
   echo: {
    inputSchema: z.object({ message: z.string() }),
    execute: async (input: { message: string }) => { calls++; return input.message; },
   },
  });
  const descriptor = adapter.resolveTool('echo');
  expect(descriptor?.host).toBe('local');
  await expect(descriptor?.validate({ message: 3 })).rejects.toThrow('Invalid input');
  const input = await descriptor!.validate({ message: 'hello' });
  const output = await adapter.host.execute({
   id: 'call', runId: 'run', toolName: 'echo', input,
   inputDigest: 'not-persisted-in-this-adapter-test', host: 'local',
  });
  expect(output).toBe('hello');
  expect(calls).toBe(1);
 });
});
