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

describe('agent run recovery boundary', () => {
 it('resumes an interrupted model-only run without recreating its identity', async () => {
  const { engine, events } = fixture([{ kind: 'complete', text: 'recovered' }]);
  await events.append('run', 0, [{ type: 'run.created', runId: 'run', sessionId: 'session', at: '2026-01-01T00:00:00Z' }]);
  await events.append('run', 1, [{ type: 'run.transitioned', runId: 'run', at: '2026-01-01T00:00:00Z', from: 'created', to: 'preparing_context' }]);
  await events.append('run', 2, [{ type: 'run.transitioned', runId: 'run', at: '2026-01-01T00:00:00Z', from: 'preparing_context', to: 'interrupted' }]);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  ports.verifyTranscript = async () => true;
  const result = await engine.resume('session', 'run');
  expect(result.snapshot.state).toBe('completed');
  expect((await events.read('run')).filter(e => e.type === 'run.created')).toHaveLength(1);
 });
 it('refuses to resume a run with unreconciled tool side effects', async () => {
  const { engine, events } = fixture([]);
  const at = '2026-01-01T00:00:00Z', runId = 'run';
  const transitions = [
   ['created', 'preparing_context'], ['preparing_context', 'calling_model'],
   ['calling_model', 'validating_tools'], ['validating_tools', 'executing_tools'],
  ] as const;
  await events.append(runId, 0, [{ type: 'run.created', runId, sessionId: 'session', at }]);
  for (const [from, to] of transitions) {
   const revision = (await events.read(runId)).length;
   await events.append(runId, revision, [{ type: 'run.transitioned', runId, at, from, to }]);
  }
  const { createHash } = await import('node:crypto');
  const input = {};
  const revision = (await events.read(runId)).length;
  await events.append(runId, revision, [{
   type: 'tool.prepared', runId, at, invocation: {
    id: 'x', runId, toolName: 'shell', input, inputDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'), host: 'local',
   },
  }]);
  await events.append(runId, revision + 1, [{ type: 'run.transitioned', runId, at, from: 'executing_tools', to: 'interrupted' }]);
  await expect(engine.resume('session', runId)).rejects.toThrow('Tool journal reconciliation required');
 });
});

describe('agent cancellation', () => {
 it('persists cancellation before a model request when already aborted', async () => {
  const { engine, events } = fixture([]);
  const controller = new AbortController();
  controller.abort();
  await expect(engine.run('session', 'run', 3, controller.signal)).rejects.toThrow();
  expect((await events.snapshot('run')).state).toBe('cancelled');
 });
});

describe('context adapter isolation', () => {
 it('uses compacted context for model requests without changing persisted history', async () => {
  const { engine, transcript } = fixture([{ kind: 'complete', text: 'done' }]);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  let sawPrepared = false;
  ports.prepareContext = async original => {
   expect(original).toHaveLength(1);
   return [{ role: 'user', content: 'compacted context' }];
  };
  ports.model = { next: async prepared => {
   sawPrepared = prepared[0].content === 'compacted context';
   return { kind: 'complete', text: 'done' };
  } };
  await engine.run('session', 'run');
  expect(sawPrepared).toBe(true);
  expect(transcript[0].content).toBe('run a tool');
 });
});

describe('skill lifecycle event integration', () => {
 it('records activated skills during tool-driven agent execution', async () => {
  const { engine } = fixture([
   { kind: 'tools', calls: [{ id: 'call', name: 'shell', input: {} }] },
   { kind: 'complete', text: 'done' },
  ]);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  ports.activatedSkill = () => ({ id: 'review', source: 'project' });
  const result = await engine.run('session', 'run');
  expect(result.snapshot.activeSkills).toEqual(['review']);
 });
});

describe('host recovery reconciliation', () => {
 it('fails closed when a reconciliation callback leaves a prepared side effect unresolved', async () => {
  const { engine, events, calls } = fixture([]);
  const at = '2026-01-01T00:00:00Z', runId = 'run';
  const transitions = [
   ['created', 'preparing_context'], ['preparing_context', 'calling_model'],
   ['calling_model', 'validating_tools'], ['validating_tools', 'executing_tools'],
  ] as const;
  await events.append(runId, 0, [{ type: 'run.created', runId, sessionId: 'session', at }]);
  for (const [from, to] of transitions) {
   await events.append(runId, (await events.read(runId)).length, [{ type: 'run.transitioned', runId, at, from, to }]);
  }
  const { createHash } = await import('node:crypto');
  const input = {};
  await events.append(runId, (await events.read(runId)).length, [{
   type: 'tool.prepared', runId, at, invocation: {
    id: 'pending', runId, toolName: 'shell', input,
    inputDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'), host: 'local',
   },
  }]);
  await events.append(runId, (await events.read(runId)).length, [
   { type: 'run.transitioned', runId, at, from: 'executing_tools', to: 'interrupted' },
  ]);
  let reconciled = false;
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  ports.reconcileRecovery = async () => { reconciled = true; };
  await expect(engine.resume('session', runId)).rejects.toThrow('Unresolved tool effects');
  expect(reconciled).toBe(true);
  expect(calls()).toBe(0);
 });
});

describe('verified recovery requires journal and transcript agreement', () => {
 it('refuses successful tool effects even after reconciliation unless the transcript is verified', async () => {
  const { engine, events, calls } = fixture([]);
  const runId = 'run', at = '2026-01-01T00:00:00Z', input = {};
  const { createHash } = await import('node:crypto');
  const eventsToReplay = [
    { type: 'run.created', runId, at, sessionId: 'session' },
    { type: 'run.transitioned', runId, at, from: 'created', to: 'preparing_context' },
    { type: 'run.transitioned', runId, at, from: 'preparing_context', to: 'calling_model' },
    { type: 'run.transitioned', runId, at, from: 'calling_model', to: 'validating_tools' },
    { type: 'run.transitioned', runId, at, from: 'validating_tools', to: 'executing_tools' },
    { type: 'tool.prepared', runId, at, invocation: {
      id: 'call', runId, toolName: 'shell', input,
      inputDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'), host: 'local',
    } },
    { type: 'tool.settled', runId, at, invocationId: 'call', outcome: 'succeeded', result: { ok: true } },
    { type: 'run.transitioned', runId, at, from: 'executing_tools', to: 'interrupted' },
  ] as import('@ocean/core').RuntimeEvent[];
  await events.append(runId, 0, eventsToReplay);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  ports.reconcileRecovery = async () => {};
  ports.verifyToolJournal = async () => false;
  await expect(engine.resume('session', runId)).rejects.toThrow('Tool journal and transcript verification required');
  expect(calls()).toBe(0);
 });
});

describe('verified recovery with reconciled side effects', () => {
 it('resumes only with verified durable transcript and never re-executes completed tool calls', async () => {
  const { engine, events, calls } = fixture([{ kind: 'complete', text: 'recovered' }]);
  const runId = 'run', at = '2026-01-01T00:00:00Z', input = {};
  const { createHash } = await import('node:crypto');
  await events.append(runId, 0, [
   { type: 'run.created', runId, at, sessionId: 'session' },
   { type: 'run.transitioned', runId, at, from: 'created', to: 'preparing_context' },
   { type: 'run.transitioned', runId, at, from: 'preparing_context', to: 'calling_model' },
   { type: 'run.transitioned', runId, at, from: 'calling_model', to: 'validating_tools' },
   { type: 'run.transitioned', runId, at, from: 'validating_tools', to: 'executing_tools' },
   { type: 'tool.prepared', runId, at, invocation: {
    id: 'previous', runId, toolName: 'shell', input,
    inputDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'), host: 'local',
   } },
   { type: 'tool.settled', runId, at, invocationId: 'previous', outcome: 'succeeded', result: { ok: true } },
   { type: 'run.transitioned', runId, at, from: 'executing_tools', to: 'interrupted' },
  ]);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  let verified = 0;
  ports.reconcileRecovery = async () => {};
  ports.verifyToolJournal = async () => { verified++; return true; };
  const result = await engine.resume('session', runId);
  expect(result.snapshot.state).toBe('completed');
  expect(verified).toBe(1);
  expect(calls()).toBe(0);
 });
});

describe('final transcript persistence crash', () => {
 it('keeps the run interrupted when final answer persistence fails', async () => {
  const { engine, events } = fixture([{ kind: 'complete', text: 'answer' }]);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  ports.transcript.append = async () => { throw new Error('disk unavailable'); };
  await expect(engine.run('session', 'run')).rejects.toThrow('disk unavailable');
  expect((await events.snapshot('run')).state).toBe('interrupted');
 });
});

describe('model-only recovery integrity', () => {
 it('requires transcript verification before re-entering model execution', async () => {
  const { engine, events } = fixture([{ kind: 'complete', text: 'untrusted' }]);
  const at = '2026-01-01T00:00:00Z', runId = 'run';
  await events.append(runId, 0, [
   { type: 'run.created', runId, at, sessionId: 'session' },
   { type: 'run.transitioned', runId, at, from: 'created', to: 'preparing_context' },
   { type: 'run.transitioned', runId, at, from: 'preparing_context', to: 'interrupted' },
  ]);
  await expect(engine.resume('session', runId)).rejects.toThrow('Transcript verification required');
 });
});

describe('bounded host Stop hook continuation', () => {
 it('runs another model step when the completion verifier provides feedback', async () => {
  const { engine, transcript, events } = fixture([
   { kind: 'complete', text: 'premature' },
   { kind: 'complete', text: 'verified' },
  ]);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  let checks = 0;
  ports.completion = {
   verify: async () => ++checks === 1 ? [] : ['host approved completion'],
   onIncomplete: async () => ({ role: 'user', content: 'Continue the task.' }),
  };
  const result = await engine.run('session', 'run', 3);
  expect(result.snapshot.state).toBe('completed');
  expect(checks).toBe(2);
  expect(transcript.map(message => message.content)).toEqual([
   'run a tool', 'premature', 'Continue the task.', 'verified',
  ]);
  expect((await events.read('run')).some(event => event.type === 'run.completion_verified')).toBe(true);
 });
 it('fails within the step limit when a Stop hook repeatedly rejects completion', async () => {
  const { engine, events } = fixture([
   { kind: 'complete', text: 'first' },
   { kind: 'complete', text: 'second' },
  ]);
  const ports = (engine as any).ports as AgentExecutionPorts<Message>;
  ports.completion = {
   verify: async () => [],
   onIncomplete: async () => ({ role: 'user', content: 'Continue' }),
  };
  await expect(engine.run('session', 'run', 2)).rejects.toThrow('maximum steps');
  expect((await events.snapshot('run')).state).toBe('failed');
 });
});
