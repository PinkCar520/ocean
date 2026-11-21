import { describe, expect, it } from 'vitest';
import { AgentExecutionEngine, MemoryRuntimeEventStore, type AgentExecutionPorts } from '@ocean/core';

type Message = { role: string; content: string };
function fixture(decisions: Array<{ kind: 'complete'; text: string } | { kind: 'tools'; calls: Array<{ id: string; name: string; input: unknown }> }>) {
  const events = new MemoryRuntimeEventStore();
  const transcript: Message[] = [{ role: 'user', content: 'run a tool' }];
  let hostCalls = 0;
  const ports: AgentExecutionPorts<Message> = {
    events,
    host: { execute: async () => { hostCalls++; return { ok: true }; } },
    model: { next: async () => {
      const decision = decisions.shift();
      if (!decision) throw new Error('Unexpected model call');
      return decision;
    } },
    transcript: {
      load: async () => [...transcript],
      append: async (_sessionId, expectedLength, next) => {
        if (transcript.length !== expectedLength) throw new Error('Transcript revision conflict');
        transcript.push(...next);
      },
    },
    authorization: { evaluate: async () => 'allow' },
    resolveTool: name => name === 'shell' ? { name, host: 'local', validate: x => x } : undefined,
    toMessage: (decision, result) => ({
      role: decision.kind === 'complete' ? 'assistant' : 'tool',
      content: decision.kind === 'complete' ? decision.text : JSON.stringify(result),
    }),
    completion: { verify: async () => ['host checked final response'] },
  };
  return { engine: new AgentExecutionEngine(ports), events, transcript, calls: () => hostCalls };
}

describe('portable Agent execution engine', () => {
 it('executes model/tool/model steps through one event-sourced runtime', async () => {
  const { engine, events, transcript, calls } = fixture([
   { kind: 'tools', calls: [{ id: 'call-1', name: 'shell', input: { cmd: 'pwd' } }] },
   { kind: 'complete', text: 'done' },
  ]);
  const result = await engine.run('session', 'run');
  expect(result.snapshot).toMatchObject({ state: 'completed', sessionId: 'session', completionVerified: true });
  expect(calls()).toBe(1);
  expect(transcript).toHaveLength(3);
  expect((await events.read('run')).some(event => event.type === 'tool.prepared')).toBe(true);
 });
 it('rejects completion without host verification', async () => {
  const fixtureResult = fixture([{ kind: 'complete', text: 'unverified' }]);
  const ports = (fixtureResult.engine as any).ports as AgentExecutionPorts<Message>;
  ports.completion = { verify: async () => [] };
  await expect(fixtureResult.engine.run('session', 'run')).rejects.toThrow('verification failed');
  expect((await fixtureResult.events.snapshot('run')).state).toBe('failed');
 });
 it('enforces a finite step limit', async () => {
  const { engine, events } = fixture([
   { kind: 'tools', calls: [{ id: 'call-1', name: 'shell', input: {} }] },
  ]);
  await expect(engine.run('session', 'run', 1)).rejects.toThrow('maximum steps');
  expect((await events.snapshot('run')).state).toBe('failed');
 });
});
