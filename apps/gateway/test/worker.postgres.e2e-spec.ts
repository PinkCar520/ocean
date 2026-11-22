import { ChatController } from '../src/chat/chat.controller';
import { ChatService } from '../src/chat/chat.service';
import { RpcGateway } from '../src/chat/rpc.gateway';
import { SkillLoader } from '../src/skill/skill.loader';
import { SkillOrchestrator } from '../src/skill/skill.orchestrator';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { SessionController } from '../src/session/session.controller';
import { SessionService } from '../src/session/session.service';
import { RunScheduleService } from '../src/run/run-schedule.service';
import { RunScheduleController } from '../src/run/run-schedule.controller';
import { GatewayCheckpointService } from '../src/tool/checkpoint.service';
import { SubagentRunsService } from '../src/run/subagent-runs.service';
import { SubagentRunsController } from '../src/run/subagent-runs.controller';
import { ExternalApprovalController } from '../src/run/external-approval.controller';
import { ApprovalMaintenanceService } from '../src/run/approval-maintenance.service';
import { createServer, Server } from 'node:http';
import { MCPOAuthService } from '../src/mcp/mcp-oauth.service';
import { MCPOAuthController } from '../src/mcp/mcp-oauth.controller';
import { MCPCredentialsController } from '../src/mcp/mcp-credentials.controller';
import { MCPCredentialsService } from '../src/mcp/mcp-credentials.service';
import { mcpUserHome, readMCPUserEnv } from '../src/mcp/mcp-client.pool';
import { GatewayHooks } from '../src/worker/gateway-hooks';
import { PermissionService } from '../src/skill/permission.service';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID, randomBytes } from 'node:crypto';
import { SsoAuthGuard } from '../src/auth/sso.guard';
import { UserService } from '../src/auth/user.service';
import { ApiKeyService } from '../src/auth/api-key.service';
import { RunController } from '../src/run/run.controller';
import { RunService } from '../src/run/run.service';
import { PrismaRuntimeEventStore } from '../src/run/runtime-event-store';
import { OutboxService } from '../src/run/outbox.service';
import { SpaceService } from '../src/space/space.service';
import { ArtifactStore } from '../src/artifact/artifact.store';
import { MetricsService } from '../src/obs/metrics.service';
import { AuditService } from '../src/audit/audit.service';
import { ToolRegistry } from '../src/tool/tool.registry';
import { RunRunner } from '../src/worker/run-runner';
import { GatewayCoreLifecycle } from '../src/worker/core-lifecycle';
import { ToolExecutor } from '../src/worker/tool-executor';
import { WorkerService } from '../src/worker/worker.service';
import { ToolOutcomeReconciler, type ToolOutcomeQueryAdapter } from '../src/worker/tool-outcome-reconciler';
import { ConfigService } from '@nestjs/config';
import { AiSdkModelGateway } from '../src/ai/ai-sdk-model-gateway';
import { startProviderContract } from './fixtures/provider-contract';
import { SimModelGateway } from '../src/ai/sim-model-gateway';

const integration = process.env.OCEAN_GATEWAY_E2E_PG_TEST === '1' ? describe : describe.skip;
integration('HTTP -> PostgreSQL Outbox -> production Worker', () => {
 let app: INestApplication;
 let oauth: MCPOAuthService;
 let oauthServer: Server;
 let oauthBase: string;
 let pool: Pool;
 let db: PrismaClient;
 let worker: WorkerService;
 let schedules: RunScheduleService;
 let providerContract: Awaited<ReturnType<typeof startProviderContract>>;
 const providerModelId = 'ocean-provider-contract';
 let registry: ToolRegistry;
 const policyHome = mkdtempSync(resolve(tmpdir(), 'ocean-worker-policy-'));
 const userId = randomUUID();
 const spaceId = `e2e-${randomUUID()}`;
 const jwt = new JwtService({ secret: 'isolated-e2e-secret' });
 const auth = () => jwt.sign({ sub: userId, workId: userId }, { expiresIn: '5m' });
 beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local isolated DB required');
  pool = new Pool({ connectionString: url.toString() });
  db = new PrismaClient({ adapter: new PrismaPg(pool) });
  await db.user.create({ data: { id: userId, workId: userId } });
  await db.space.create({ data: { id: spaceId, slug: spaceId, name: 'E2E', type: 'work' } });
  await db.membership.create({ data: { userId, spaceId } });
  oauthServer = createServer(async (request, response) => {
   request.resume(); response.setHeader('content-type', 'application/json');
   response.end(JSON.stringify({ access_token: 'oauth-test-secret', token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh-test-secret' }));
  });
  await new Promise<void>(resolve => oauthServer.listen(0, '127.0.0.1', resolve));
  oauthBase = `http://127.0.0.1:${(oauthServer.address() as { port: number }).port}`;
  oauth = new MCPOAuthService({ root: resolve(policyHome, 'oauth'), key: randomBytes(32).toString('base64'), servers: {
   fixture: { serverUrl: oauthBase + '/mcp', authorizationUrl: oauthBase + '/authorize', tokenUrl: oauthBase + '/token', clientId: 'ocean', redirectUri: 'http://127.0.0.1:4321/api/mcp-oauth/callback' },
  } });
  const metrics = new MetricsService();
  const outbox = new OutboxService(db);
  mkdirSync(resolve(policyHome, 'workspace'), { recursive: true });
  registry = new ToolRegistry(undefined, undefined, undefined, new GatewayCheckpointService(db, { [spaceId]: resolve(policyHome, 'workspace') }));
  const artifacts = new ArtifactStore(db);
  const hookFile = resolve(policyHome, 'hooks.json');
  writeFileSync(hookFile, JSON.stringify({ trustedSpaces: [spaceId], hooks: {} }), { mode: 0o600 });
  const hooks = GatewayHooks.load(hookFile);
  const spaces = new SpaceService(db);
  const service = new RunService(db, outbox, spaces, artifacts, metrics);
  schedules = new RunScheduleService(db, spaces, service);
  const subagents = new SubagentRunsService(db, outbox);
  providerContract = await startProviderContract();
  const provider = new AiSdkModelGateway(new ConfigService({
   DEFAULT_AI_PROVIDER: 'local',
   LOCAL_MODEL: providerModelId,
   LOCAL_BASE_URL: providerContract.baseURL,
   LOCAL_API_KEY: 'fixture',
  }));
  const sim = new SimModelGateway(0);
  const core = new GatewayCoreLifecycle();
  worker = new WorkerService(new RunRunner(db, {
   generate: req => {
    if (req.modelId === providerModelId) return provider.generate(req);
    if (req.messages.some(message => message.role === 'user' && message.text === 'Gateway delegation fixture')) {
     const result = req.messages.find(message => message.role === 'tool' && message.toolName === 'delegate_task');
     if (result) return Promise.resolve({ text: 'Delegation result received', toolCalls: [] });
     return Promise.resolve({
      text: '', toolCalls: [{ id: 'delegation-fixture', name: 'delegate_task', input: { agent: 'reader', task: 'Inspect the fixture' } }],
     });
    }
    if (req.messages.some(message => message.role === 'user' && message.text === 'Gateway two-tool batch fixture')) {
     const echoed = req.messages.filter(message => message.role === 'tool' && message.toolName === 'echo');
     if (echoed.length === 2) return Promise.resolve({ text: 'Both batch tools completed', toolCalls: [] });
     return Promise.resolve({ text: 'Running both tools', toolCalls: [
      { id: 'batch-echo-first', name: 'echo', input: { text: 'one' } },
      { id: 'batch-echo-second', name: 'echo', input: { text: 'two' } },
     ] });
    }
    return sim.generate(req);
   },
  }, outbox, registry, metrics, hooks, core),
   new ToolExecutor(db, registry, outbox, metrics, new AuditService(db), new PermissionService(policyHome), hooks, subagents, service, core), outbox, db, subagents);
  const module = await Test.createTestingModule({ controllers: [ChatController, SessionController, RunScheduleController, SubagentRunsController, RunController, ExternalApprovalController, MCPCredentialsController, MCPOAuthController], providers: [
   { provide: ChatService, useValue: new ChatService(new ConfigService({ CHAT_USE_RUN: 'true' }), service) },
   { provide: SpaceService, useValue: spaces },
   { provide: SkillOrchestrator, useValue: {} },
   { provide: SkillLoader, useValue: {} },
   { provide: RpcGateway, useValue: {} },
   { provide: MCPOAuthService, useValue: oauth },
   { provide: MCPCredentialsService, useValue: new MCPCredentialsService(resolve(policyHome, 'credentials')) },
   { provide: SubagentRunsService, useValue: subagents },
   { provide: RunScheduleService, useValue: schedules },
   { provide: SessionService, useValue: new SessionService(db, spaces) },
   { provide: RunService, useValue: service }, { provide: ArtifactStore, useValue: artifacts },
   { provide: JwtService, useValue: jwt },
   { provide: UserService, useValue: new UserService(db) },
   { provide: ApiKeyService, useValue: new ApiKeyService(db) },
   { provide: APP_GUARD, useClass: SsoAuthGuard },
  ] }).compile();
  app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
 }, 15000);
 afterAll(async () => {
  worker?.stop();
  await app?.close();
  await providerContract?.close();
  if (oauthServer) await new Promise<void>(resolve => oauthServer.close(() => resolve()));
  if (db) {
   await db.agentRun.deleteMany({ where: { userId } });
   await db.outboxEvent.deleteMany({ where: { payload: { path: ['userId'], equals: userId } } });
   await db.session.deleteMany({ where: { userId } });
   await db.space.deleteMany({ where: { id: spaceId } });
   await db.user.deleteMany({ where: { id: userId } });
   await db.$disconnect();
  }
  await pool?.end();
  rmSync(policyHome, { recursive: true, force: true });
 });
 it('reconciles a persisted unknown external effect through Worker polling without dispatching it again', async () => {
  const run = await db.agentRun.create({ data: {
   userId, spaceId, spaceType: 'work', input: 'Reconcile lost external result', status: 'failed',
  } });
  const key = 'reconcile-' + randomUUID();
  const step = await db.runStep.create({ data: {
   runId: run.id, seq: 1, kind: 'tool_call', status: 'unknown',
   idempotencyKey: key,
   input: { name: 'external.fixture', input: { target: 'remote-resource' }, idempotencyKey: key },
  } });
  const query = jest.fn(async () => ({
   status: 'succeeded' as const, idempotencyKey: key, output: { receipt: 'confirmed' },
  }));
  const adapter: ToolOutcomeQueryAdapter = { query };
  const reconciliationWorker = new WorkerService(
   { execute: jest.fn() } as never,
   { execute: jest.fn() } as never,
   { claimRunRequests: jest.fn().mockResolvedValue([]) } as never,
   db,
   undefined,
   new ToolOutcomeReconciler(db, new Map([['external.fixture', adapter]])),
  );
  try {
   reconciliationWorker.start();
   const deadline = Date.now() + 8000;
   let result = await db.runStep.findUniqueOrThrow({ where: { id: step.id } });
   while (result.status !== 'succeeded' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 30));
    result = await db.runStep.findUniqueOrThrow({ where: { id: step.id } });
   }
   expect(result.status).toBe('succeeded');
   expect(result.output).toEqual({ receipt: 'confirmed' });
   expect(query).toHaveBeenCalledTimes(1);
   expect(query).toHaveBeenCalledWith({
    runId: run.id, stepId: step.id, toolName: 'external.fixture',
    idempotencyKey: key, input: { target: 'remote-resource' },
   });
   expect((await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('failed');
  } finally {
   reconciliationWorker.stop();
   await db.agentRun.delete({ where: { id: run.id } });
  }
 }, 15000);

 it('rejects unauthenticated creation without persisting a Run', async () => {
  await request(app.getHttpServer()).post('/api/runs').send({ space: { id: spaceId, type: 'work' }, input: 'hello' }).expect(401);
  expect(await db.agentRun.count({ where: { userId } })).toBe(0);
 });
 it('forks the latest Gateway message branch into independent records', async () => {
  const original = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'Fork fixture' } });
  const root = await db.message.create({ data: { sessionId: original.id, role: 'user', content: 'Root', createdAt: new Date(1000) } });
  await db.message.create({ data: { sessionId: original.id, parentId: root.id, role: 'assistant', content: 'Older branch', createdAt: new Date(2000) } });
  await db.message.create({ data: { sessionId: original.id, parentId: root.id, role: 'assistant', content: 'Latest branch', createdAt: new Date(3000) } });
  const endpoint = `/api/sessions/${original.id}/fork`;
  await request(app.getHttpServer()).post(endpoint).expect(401);
  await expect(app.get(SessionService).forkSession(original.id, randomUUID())).rejects.toThrow('not found');
  const fork = await request(app.getHttpServer()).post(endpoint).auth(auth(), { type: 'bearer' }).expect(201);
  const forkId = fork.body.data.id;
  expect(forkId).not.toBe(original.id);
  const messages = await db.message.findMany({ where: { sessionId: forkId }, orderBy: { createdAt: 'asc' } });
  expect(messages.map(message => message.content)).toEqual(['Root', 'Latest branch']);
  expect(messages[0].id).not.toBe(root.id);
  expect(messages[1].parentId).toBe(messages[0].id);
  const earlierFork = await request(app.getHttpServer()).post(endpoint).auth(auth(), { type: 'bearer' })
   .send({ messageId: root.id }).expect(201);
  const earlierMessages = await db.message.findMany({ where: { sessionId: earlierFork.body.data.id } });
  expect(earlierMessages.map(message => message.content)).toEqual(['Root']);
  await request(app.getHttpServer()).post(endpoint).auth(auth(), { type: 'bearer' })
   .send({ messageId: messages[0].id }).expect(404);
  expect(await db.message.count({ where: { sessionId: original.id } })).toBe(3);
 });

 it('creates one background Run when concurrent workers see the same due schedule', async () => {
  const response = await request(app.getHttpServer()).post('/api/run-schedules').auth(auth(), { type: 'bearer' })
   .send({ spaceId, cron: '* * * * *', recurring: false, prompt: 'scheduled worker fixture' }).expect(201);
  const due = new Date(response.body.nextRunAt);
  await Promise.all([schedules.dispatchDue(due), schedules.dispatchDue(due)]);
  const schedule = await db.runSchedule.findUniqueOrThrow({ where: { id: response.body.id } });
  expect(schedule).toMatchObject({ active: false, nextRunAt: null });
  expect(typeof schedule.lastRunId).toBe('string');
  const runs = await db.agentRun.findMany({ where: { userId, metadata: { path: ['scheduleId'], equals: schedule.id } } });
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ id: schedule.lastRunId, status: 'queued', priority: 'background' });
  await request(app.getHttpServer()).post(`/api/runs/${runs[0].id}/cancel`).auth(auth(), { type: 'bearer' }).send({}).expect(201);
 });

 it('returns persisted model-driven delegation results to the parent model', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'Gateway delegation fixture', metadata: { nonInteractive: true } }).expect(201);
  const runId = response.body.run.id;
  worker.start();
  try { await waitFor(runId, 'succeeded'); } finally { worker.stop(); }
  const child = await db.agentRun.findFirstOrThrow({ where: { parentRunId: runId, parentToolCallId: 'delegation-fixture' } });
  expect(child.status).toBe('succeeded');
  const steps = await db.runStep.findMany({ where: { runId }, orderBy: { seq: 'asc' } });
  expect(steps.some(step => step.kind === 'subagent' && step.status === 'succeeded')).toBe(true);
  expect(steps.at(-1)?.output).toMatchObject({ text: 'Delegation result received' });
 }, 15000);

 it('persists creation and runs a real model/tool continuation through the worker queue', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: '调用工具 echo' }).expect(201);
  const runId = response.body.run?.id ?? response.body.id;
  expect(typeof runId).toBe('string');
  expect(await db.outboxEvent.count({ where: { aggregateId: runId, topic: 'run.requested', status: 'pending' } })).toBe(1);
  worker.start();
  const deadline = Date.now() + 12000;
  while ((await db.agentRun.findUniqueOrThrow({ where: { id: runId } })).status !== 'succeeded') {
   if (Date.now() > deadline) throw new Error(JSON.stringify(await db.agentRun.findUnique({ where: { id: runId }, include: { steps: true } })));
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  worker.stop();
  const steps = await db.runStep.findMany({ where: { runId }, orderBy: { seq: 'asc' } });
  expect(steps.filter(s => s.kind === 'model_call' && s.status === 'succeeded')).toHaveLength(2);
  expect(steps.filter(s => s.kind === 'tool_call' && s.status === 'succeeded')).toHaveLength(1);
  expect(await db.outboxEvent.count({ where: { aggregateId: runId, topic: 'tool.requested', status: 'processed' } })).toBe(1);
  const runtimeEvents = await new PrismaRuntimeEventStore(db).read(runId);
  expect(runtimeEvents.map(event => event.type)).toEqual(expect.arrayContaining([
   'run.created', 'tool.proposed', 'tool.prepared', 'tool.settled', 'run.completion_verified',
  ]));
  expect(runtimeEvents.filter(event => event.type === 'run.transitioned').at(-1))
   .toMatchObject({ type: 'run.transitioned', to: 'completed' });
 }, 15000);
 it('completes three provider tool rounds through HTTP, persisted Worker and final model response', async () => {
  const initialRequests = providerContract.requests.length;
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'OCEAN_LONG_TASK: call echo three times and finish',
    metadata: { modelId: providerModelId, nonInteractive: true } }).expect(201);
  const runId = response.body.run?.id ?? response.body.id;
  worker.start();
  try { await waitFor(runId, 'succeeded'); } finally { worker.stop(); }
  const steps = await db.runStep.findMany({ where: { runId }, orderBy: { seq: 'asc' } });
  expect(steps.filter(step => step.kind === 'model_call' && step.status === 'succeeded')).toHaveLength(4);
  expect(steps.filter(step => step.kind === 'tool_call' && step.status === 'succeeded')).toHaveLength(3);
  expect(steps.at(-1)?.output).toMatchObject({ text: 'OCEAN_PROVIDER_OK' });
  const requests = providerContract.requests.slice(initialRequests);
  expect(requests).toHaveLength(4);
  expect(requests.map(req => req.messages.filter(msg => msg.role === 'tool').length)).toEqual([0, 1, 2, 3]);
  expect(await db.outboxEvent.count({ where: { aggregateId: runId, topic: 'tool.requested', status: 'processed' } })).toBe(3);
 }, 20000);
 async function waitFor(runId: string, status: string) {
  const deadline = Date.now() + 12000;
  while ((await db.agentRun.findUniqueOrThrow({ where: { id: runId } })).status !== status) {
   if (Date.now() > deadline) {
    const run = await db.agentRun.findUniqueOrThrow({ where: { id: runId } });
    const steps = await db.runStep.findMany({ where: { runId }, orderBy: { seq: 'asc' },
     select: { kind: true, status: true, error: true } });
    throw new Error(`Run ${runId} never reached ${status}; actual=${run.status}; steps=${JSON.stringify(steps)}`);
   }
   await new Promise(resolve => setTimeout(resolve, 100));
  }
 }
 it('requires a persisted session approval before tool execution and resumes via HTTP', async () => {
  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: true });
  try {
   const session = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'Approval fixture' } });
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: '调用工具 approved', metadata: { sessionId: session.id } }).expect(201);
   const runId = response.body.run?.id ?? response.body.id;
   worker.start();
   await waitFor(runId, 'waiting_for_approval');
   const approval = await db.runApproval.findFirstOrThrow({ where: { runId, status: 'pending' } });
   expect(approval.policyVersion).toBeTruthy();
   expect(approval.argsHash).toBeTruthy();
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call', status: 'succeeded' } })).toBe(0);
   await request(app.getHttpServer()).post(`/api/runs/${runId}/approvals/${approval.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved', scope: 'session' }).expect(201);
   await waitFor(runId, 'succeeded');
   expect(await db.runApproval.findUniqueOrThrow({ where: { id: approval.id } })).toMatchObject({ scope: 'session', status: 'approved' });
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call', status: 'succeeded' } })).toBe(1);
  } finally { worker.stop(); registry.register(echo); }
 }, 15000);
 it('cancels a queued Run and retries it through the persisted queue', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'cancel then retry' }).expect(201);
  const runId = response.body.run?.id ?? response.body.id;
  await request(app.getHttpServer()).post(`/api/runs/${runId}/cancel`).auth(auth(), { type: 'bearer' }).send({}).expect(201);
  expect(await db.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'cancelled' });
  expect(await db.runStep.count({ where: { runId } })).toBe(0);
  await request(app.getHttpServer()).post(`/api/runs/${runId}/retry`).auth(auth(), { type: 'bearer' }).send({}).expect(201);
  worker.start();
  await waitFor(runId, 'succeeded');
  worker.stop();
 }, 15000);

 it('persists portable Agent Core events in PostgreSQL without sharing legacy event sequences', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'runtime core event isolation' }).expect(201);
  const runId = response.body.run?.id ?? response.body.id;
  const store = new PrismaRuntimeEventStore(db);
  const at = new Date().toISOString();
  await expect(store.append(runId, 0, [{ type: 'run.created', runId, at, sessionId: 'session-core', schemaVersion: 1 }])).resolves.toBe(1);
  await expect(store.append(runId, 1, [{ type: 'run.transitioned', runId, at, from: 'created', to: 'preparing_context' }])).resolves.toBe(2);
  expect((await store.read(runId)).map(event => event.type)).toEqual(['run.created', 'run.transitioned']);
  await expect(store.append(runId, 1, [{ type: 'run.transitioned', runId, at, from: 'created', to: 'preparing_context' }])).rejects.toThrow('revision conflict');
 }, 15000);

 it('recovers a persisted stale running Run during Worker startup', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'recover abandoned execution' }).expect(201);
  const runId = response.body.run?.id ?? response.body.id;
  await db.agentRun.update({ where: { id: runId }, data: {
   status: 'running', executionToken: 'dead-worker', executionJobId: 'lost-job', executionAttempt: 1,
   updatedAt: new Date(Date.now() - 600000),
  } });
  await db.outboxEvent.deleteMany({ where: { aggregateId: runId } });
  await worker.onModuleInit();
  await waitFor(runId, 'succeeded');
  // Run completion and outbox acknowledgement are distinct persisted writes.
  // Wait for the delivery acknowledgement instead of racing the Worker.
  const acknowledgementDeadline = Date.now() + 5000;
  while (await db.outboxEvent.count({ where: { aggregateId: runId, status: 'processed' } }) !== 1) {
   if (Date.now() > acknowledgementDeadline) throw new Error('Recovered outbox delivery was not acknowledged');
   await new Promise(resolve => setTimeout(resolve, 50));
  }
  worker.stop();
  expect(await db.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ executionToken: null });
  expect(await db.outboxEvent.count({ where: { aggregateId: runId, status: 'processed' } })).toBe(1);
  expect(await db.runStep.count({ where: { runId, kind: 'model_call', status: 'succeeded' } })).toBe(1);
 }, 15000);

 it('does not repeat a tool side effect when its persisted delivery is duplicated', async () => {
  const echo = registry.get('echo')!;
  let executions = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  registry.register({ ...echo, effect: 'non-idempotent-write', async execute(input, context) {
   executions++; await barrier; return echo.execute(input, context);
  } });
  try {
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: '调用工具 duplicate' }).expect(201);
   const runId = response.body.run?.id ?? response.body.id;
   worker.start();
   const deadline = Date.now() + 12000;
   while (executions === 0) {
    if (Date.now() > deadline) throw new Error('Tool never started');
    await new Promise(resolve => setTimeout(resolve, 50));
   }
   const delivery = await db.outboxEvent.findFirstOrThrow({ where: { aggregateId: runId, topic: 'tool.requested' } });
   const duplicate = await db.outboxEvent.create({ data: {
    topic: delivery.topic, aggregateType: delivery.aggregateType, aggregateId: runId,
    payload: delivery.payload!, priorityRank: delivery.priorityRank,
   } });
   release();
   await waitFor(runId, 'succeeded');
   const settled = Date.now() + 5000;
   while ((await db.outboxEvent.findUniqueOrThrow({ where: { id: duplicate.id } })).status !== 'processed') {
    if (Date.now() > settled) throw new Error('Duplicate delivery not acknowledged');
    await new Promise(resolve => setTimeout(resolve, 50));
   }
   expect(executions).toBe(1);
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call' } })).toBe(1);
  } finally { release(); worker.stop(); registry.register(echo); }
 }, 20000);

 it('supersedes a persisted approval from an obsolete policy before executing the tool', async () => {
  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: true });
  try {
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: '调用工具 stale policy' }).expect(201);
   const runId = response.body.run?.id ?? response.body.id;
   worker.start(); await waitFor(runId, 'waiting_for_approval');
   const old = await db.runApproval.findFirstOrThrow({ where: { runId, status: 'pending' } });
   await db.runApproval.update({ where: { id: old.id }, data: { policyVersion: 'obsolete-policy-version' } });
   await request(app.getHttpServer()).post(`/api/runs/${runId}/approvals/${old.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved' }).expect(201);
   await waitFor(runId, 'waiting_for_approval');
   expect(await db.runApproval.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: 'superseded' });
   const fresh = await db.runApproval.findFirstOrThrow({ where: { runId, status: 'pending' } });
   expect(fresh.id).not.toBe(old.id);
   expect(fresh.policyVersion).toBe(old.policyVersion);
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call', status: 'succeeded' } })).toBe(0);
   await request(app.getHttpServer()).post(`/api/runs/${runId}/approvals/${fresh.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved' }).expect(201);
   await waitFor(runId, 'succeeded');
  } finally { worker.stop(); registry.register(echo); }
 }, 20000);

 it('resumes the same persisted model step after a separate Worker is killed with SIGKILL', async () => {
  let child: ChildProcess | undefined;
  let logs = '';
  const launch = (delay: string) => {
   const process = spawn(global.process.execPath, [resolve(__dirname, 'fixtures/crash-worker.cjs')], {
    cwd: global.process.cwd(), env: { ...global.process.env, CRASH_MODEL_DELAY_MS: delay,
     WORKER_POLL_MS: '50', WORKER_LEASE_MS: '1000', WORKER_STALE_MS: '1000' }, stdio: ['ignore', 'pipe', 'pipe'],
   });
   process.stdout?.on('data', chunk => { logs += chunk; });
   process.stderr?.on('data', chunk => { logs += chunk; });
   return process;
  };
  try {
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: 'resume after real kill' }).expect(201);
   const parentId = response.body.run?.id ?? response.body.id;
   const input = { toolCallId: 'durable-child', agent: 'researcher', prompt: 'resume child after real kill' };
   const childResponse = await request(app.getHttpServer()).post(`/api/runs/${parentId}/subagents`).auth(auth(), { type: 'bearer' }).send(input).expect(201);
   const runId = childResponse.body.id;
   expect(childResponse.body.parentRunId).toBe(parentId);
   const duplicate = await request(app.getHttpServer()).post(`/api/runs/${parentId}/subagents`).auth(auth(), { type: 'bearer' }).send(input).expect(201);
   expect(duplicate.body.id).toBe(runId);
   await request(app.getHttpServer()).post(`/api/runs/${parentId}/subagents`).auth(auth(), { type: 'bearer' }).send({ ...input, prompt: 'different' }).expect(400);
   await request(app.getHttpServer()).post(`/api/runs/${parentId}/resume`).auth(auth(), { type: 'bearer' }).send({}).expect(400);
   child = launch('600000');
   const deadline = Date.now() + 15000;
   let started;
   while (!(started = await db.runStep.findFirst({ where: { runId, kind: 'model_call', status: 'started' } }))) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Worker did not begin model step: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 50));
   }
   const killed = once(child, 'exit'); child.kill('SIGKILL');
   expect((await killed)[1]).toBe('SIGKILL');
   expect(await db.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'running' });
   await new Promise(resolve => setTimeout(resolve, 2200));
   child = launch('0');
   await waitFor(runId, 'succeeded');
   const steps = await db.runStep.findMany({ where: { runId, kind: 'model_call' } });
   await waitFor(parentId, 'succeeded');
   const parentStep = await db.runStep.findFirstOrThrow({ where: { runId: parentId, kind: 'subagent' } });
   expect(parentStep).toMatchObject({ status: 'succeeded', checkpoint: { childRunId: runId }, output: { childRunId: runId, status: 'succeeded' } });
   expect(steps).toHaveLength(1);
   expect(steps[0]).toMatchObject({ id: started.id, status: 'succeeded' });
   expect(await db.outboxEvent.count({ where: { aggregateId: runId, status: 'processed' } })).toBe(1);
  } finally {
   if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
   }
  }
 }, 35000);

 it('refuses to replay a non-idempotent side effect after SIGKILL before result persistence', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'ocean-kill-effect-'));
  const effectFile = resolve(directory, 'effects');
  let child: ChildProcess | undefined;
  let contender: ChildProcess | undefined;
  let logs = '';
  const launch = () => {
   const process = spawn(global.process.execPath, [resolve(__dirname, 'fixtures/crash-worker.cjs')], {
    cwd: global.process.cwd(), env: { ...global.process.env, CRASH_EFFECT_FILE: effectFile,
     WORKER_POLL_MS: '50', WORKER_LEASE_MS: '1000', WORKER_STALE_MS: '1000' }, stdio: ['ignore', 'pipe', 'pipe'],
   });
   process.stdout?.on('data', chunk => { logs += chunk; });
   process.stderr?.on('data', chunk => { logs += chunk; });
   return process;
  };
  try {
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: 'explicit tool crash' }).expect(201);
   const runId = response.body.run?.id ?? response.body.id;
   await db.outboxEvent.deleteMany({ where: { aggregateId: runId } });
   await db.$transaction(tx => new OutboxService(db).enqueueToolRequested(tx, {
    version: 1, runId, userId, toolCall: { id: 'crash-call', name: 'counter.increment', input: { key: runId }, idempotencyKey: 'crash-key' },
   }));
   child = launch(); await waitFor(runId, 'waiting_for_approval');
   const approval = await db.runApproval.findFirstOrThrow({ where: { runId, status: 'pending' } });
   await request(app.getHttpServer()).post(`/api/runs/${runId}/approvals/${approval.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved' }).expect(201);
   const deadline = Date.now() + 12000;
   while (!existsSync(effectFile)) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Side effect never started: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 50));
   }
   const started = await db.runStep.findFirstOrThrow({ where: { runId, kind: 'tool_call', status: 'started' } });
   contender = launch();
   await new Promise(resolve => setTimeout(resolve, 1500));
   expect(readFileSync(effectFile, 'utf8')).toBe('effect\n');
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call' } })).toBe(1);
   const exited = once(child, 'exit'); child.kill('SIGKILL');
   expect((await exited)[1]).toBe('SIGKILL');
   // Exercise fresh-process startup recovery after the former owner is dead.
   // The pre-existing contender may have exhausted its poll cycle before lease expiry.
   if (contender && contender.exitCode === null && contender.signalCode === null) {
    const contenderExit = once(contender, 'exit'); contender.kill('SIGKILL'); await contenderExit;
   }
   contender = launch();
   try {
    await waitFor(runId, 'failed');
   } catch (error) {
    const state = await db.agentRun.findUnique({ where: { id: runId }, select: { status: true, executionToken: true, executionJobId: true } });
    const queue = await db.outboxEvent.findMany({ where: { aggregateId: runId }, select: { topic: true, status: true } });
    const steps = await db.runStep.findMany({ where: { runId }, select: { kind: true, status: true } });
    throw new Error(`Crash recovery: ${String(error)}; state=${JSON.stringify(state)}; queue=${JSON.stringify(queue)}; steps=${JSON.stringify(steps)}; worker=${logs.slice(-2000)}`);
   }
   expect(readFileSync(effectFile, 'utf8')).toBe('effect\n');
   expect(await db.runStep.findUniqueOrThrow({ where: { id: started.id } })).toMatchObject({ status: 'unknown', output: null });
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call' } })).toBe(1);
  } finally {
   if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
   }
   if (contender && contender.exitCode === null && contender.signalCode === null) {
    const exited = once(contender, 'exit'); contender.kill('SIGKILL'); await exited;
   }
   rmSync(directory, { recursive: true, force: true });
  }
 }, 35000);

 it('does not reuse a session grant issued under an obsolete policy', async () => {
  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: true });
  const session = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'Policy grant fixture' } });
  const sessionId = session.id;
  const input = '调用工具 obsolete session grant';
  const create = async () => {
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input, metadata: { sessionId } }).expect(201);
   return response.body.run?.id ?? response.body.id;
  };
  try {
   const first = await create(); worker.start(); await waitFor(first, 'waiting_for_approval');
   const approval = await db.runApproval.findFirstOrThrow({ where: { runId: first, status: 'pending' } });
   await request(app.getHttpServer()).post(`/api/runs/${first}/approvals/${approval.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved', scope: 'session' }).expect(201);
   await waitFor(first, 'succeeded'); worker.stop();
   await db.runApproval.update({ where: { id: approval.id }, data: { policyVersion: 'obsolete-policy' } });
   const second = await create(); worker.start();
   await waitFor(second, 'waiting_for_approval');
   expect(await db.runStep.count({ where: { runId: second, kind: 'tool_call', status: 'succeeded' } })).toBe(0);
   const fresh = await db.runApproval.findFirstOrThrow({ where: { runId: second, status: 'pending' } });
   expect(fresh.policyVersion).toBe(approval.policyVersion);
  } finally { worker.stop(); registry.register(echo); }
 }, 20000);

 it('reloads a real policy file and requires fresh approval before executing an approved call', async () => {
  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: true });
  const directory = resolve(policyHome, '.ocean'); mkdirSync(directory, { recursive: true });
  const file = resolve(directory, 'settings.json');
  try {
   writeFileSync(file, JSON.stringify({ version: 'unchanged-label', mode: 'default' }));
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: '调用工具 policy file change' }).expect(201);
   const runId = response.body.run?.id ?? response.body.id;
   worker.start(); await waitFor(runId, 'waiting_for_approval'); worker.stop();
   const old = await db.runApproval.findFirstOrThrow({ where: { runId, status: 'pending' } });
   writeFileSync(file, JSON.stringify({ version: 'unchanged-label', mode: 'default', ask: ['echo'] }));
   await request(app.getHttpServer()).post(`/api/runs/${runId}/approvals/${old.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved' }).expect(201);
   worker.start(); await waitFor(runId, 'waiting_for_approval');
   expect(await db.runApproval.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: 'superseded' });
   const fresh = await db.runApproval.findFirstOrThrow({ where: { runId, status: 'pending' } });
   expect(fresh.policyVersion).not.toBe(old.policyVersion);
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call', status: 'succeeded' } })).toBe(0);
   await request(app.getHttpServer()).post(`/api/runs/${runId}/approvals/${fresh.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved' }).expect(201);
   await waitFor(runId, 'succeeded');
  } finally { worker.stop(); registry.register(echo); rmSync(file, { force: true }); }
 }, 20000);

 it('persists and executes the full two-tool model batch before model continuation', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs')
   .auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'Gateway two-tool batch fixture' }).expect(201);
  const runId = response.body.run?.id ?? response.body.id;
  try {
   worker.start();
   await waitFor(runId, 'succeeded');
   const models = await db.runStep.findMany({
    where: { runId, kind: 'model_call' }, orderBy: { seq: 'asc' },
   });
   expect(models).toHaveLength(2);
   expect((models[0].output as { toolCalls: unknown[] }).toolCalls).toHaveLength(2);
   expect(models[1].output).toMatchObject({ text: 'Both batch tools completed' });
   const tools = await db.runStep.findMany({
    where: { runId, kind: 'tool_call' }, orderBy: { seq: 'asc' },
   });
   expect(tools).toHaveLength(2);
   expect(tools.map(step => step.status)).toEqual(['succeeded', 'succeeded']);
   expect(tools.map(step => (step.output as { text: string }).text)).toEqual(['one', 'two']);
   const coreEvents = await new PrismaRuntimeEventStore(db).read(runId);
   expect(coreEvents.filter(event => event.type === 'tool.proposed')).toHaveLength(2);
   expect(coreEvents.filter(event => event.type === 'tool.prepared')).toHaveLength(2);
   expect(coreEvents.filter(event => event.type === 'tool.settled')).toHaveLength(2);
  } finally { worker.stop(); }
 }, 20000);

 it('persists Stop hook feedback and completes a second model turn through the real queue', async () => {
  const hookFile = resolve(policyHome, 'hooks.json');
  const marker = resolve(policyHome, 'stop-once');
  const script = `const fs=require('node:fs');const p=${JSON.stringify(marker)};if(!fs.existsSync(p)){fs.writeFileSync(p,'1');console.log(JSON.stringify({decision:'block',reason:'verify before stopping'}));}`;
  try {
   writeFileSync(hookFile, JSON.stringify({ trustedSpaces: [spaceId], hooks: { Stop: [{ hooks: [{ type: 'command', command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}` }] }] } }));
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: 'Stop hook continuation' }).expect(201);
   const runId = response.body.run?.id ?? response.body.id;
   worker.start(); await waitFor(runId, 'succeeded');
   // The terminal Run status commits before the Worker acknowledges its
   // outbox message. Wait for the independent durable ack before asserting,
   // instead of stopping the Worker while the second ack is still in flight.
   const ackDeadline = Date.now() + 5000;
   let processed = await db.outboxEvent.count({ where: { aggregateId: runId, status: 'processed' } });
   while (processed < 2 && Date.now() < ackDeadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
    processed = await db.outboxEvent.count({ where: { aggregateId: runId, status: 'processed' } });
   }
   expect(processed).toBe(2);
   const steps = await db.runStep.findMany({ where: { runId, kind: 'model_call' }, orderBy: { seq: 'asc' } });
   expect(steps).toHaveLength(2);
   expect(steps[0].output).toMatchObject({ hookFeedback: 'verify before stopping' });
   expect(steps[1]).toMatchObject({ status: 'succeeded' });
  } finally { worker.stop(); writeFileSync(hookFile, JSON.stringify({ trustedSpaces: [spaceId], hooks: {} })); }
 }, 20000);

 it('feeds PostToolUse feedback to the next model turn without losing the known tool result', async () => {
  const file = resolve(policyHome, 'hooks.json');
  try {
   writeFileSync(file, JSON.stringify({ trustedSpaces: [spaceId], hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify("console.log(JSON.stringify({decision:'block',reason:'inspect the returned result'}))")}` }] }] } }));
   const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
    .send({ space: { id: spaceId, type: 'work' }, input: '调用工具 post feedback' }).expect(201);
   const runId = response.body.run?.id ?? response.body.id;
   worker.start(); await waitFor(runId, 'succeeded'); worker.stop();
   const tool = await db.runStep.findFirstOrThrow({ where: { runId, kind: 'tool_call' } });
   expect(tool).toMatchObject({ status: 'succeeded', checkpoint: { hookFeedback: 'inspect the returned result' } });
   expect(tool.output).toBeTruthy();
   const model = await db.runStep.findFirstOrThrow({ where: { runId, kind: 'model_call' }, orderBy: { seq: 'desc' } });
   expect(model.output).toMatchObject({ text: '[SIM] inspect the returned result' });
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call' } })).toBe(1);
  } finally { worker.stop(); writeFileSync(file, JSON.stringify({ trustedSpaces: [spaceId], hooks: {} })); }
 }, 20000);

 it('provisions MCP credentials only under the authenticated principal and returns no secrets', async () => {
  await request(app.getHttpServer()).put('/api/mcp-credentials/environment').send({ TOKEN: 'secret' }).expect(401);
  const response = await request(app.getHttpServer()).put('/api/mcp-credentials/environment').auth(auth(), { type: 'bearer' })
   .send({ TOKEN: 'secret' }).expect(200);
  expect(response.body).toEqual({ configuredKeys: ['TOKEN'] });
  const root = resolve(policyHome, 'credentials');
  expect(await readMCPUserEnv(mcpUserHome({ userId }, root))).toEqual({ TOKEN: 'secret' });
  expect(await readMCPUserEnv(mcpUserHome({ userId: 'another-principal' }, root))).toEqual({});
  await request(app.getHttpServer()).put('/api/mcp-credentials/environment').auth(auth(), { type: 'bearer' }).send({ TOKEN: 7 }).expect(400);
  expect(await readMCPUserEnv(mcpUserHome({ userId }, root))).toEqual({ TOKEN: 'secret' });
  await request(app.getHttpServer()).put('/api/mcp-credentials/environment').auth(auth(), { type: 'bearer' }).send({}).expect(200);
  expect(await readMCPUserEnv(mcpUserHome({ userId }, root))).toEqual({});
 });

 it('authorizes OAuth with HTTP identity, completes a public one-time callback and isolates the token', async () => {
  await request(app.getHttpServer()).post('/api/mcp-oauth/fixture/authorize').send({}).expect(401);
  const response = await request(app.getHttpServer()).post('/api/mcp-oauth/fixture/authorize').auth(auth(), { type: 'bearer' }).send({ userId: 'attacker-chosen-user' }).expect(201);
  const url = new URL(response.body.authorizationUrl);
  const state = url.searchParams.get('state')!;
  const callback = await request(app.getHttpServer()).get('/api/mcp-oauth/callback').query({ state, code: 'fixture-code' }).expect(200);
  expect(callback.body).toEqual({ connected: true, serverId: 'fixture' });
  expect(await oauth.accessToken(userId, 'fixture')).toBe('oauth-test-secret');
  await expect(oauth.accessToken('attacker-chosen-user', 'fixture')).rejects.toThrow();
  await request(app.getHttpServer()).get('/api/mcp-oauth/callback').query({ state, code: 'fixture-code' }).expect(400);
  await request(app.getHttpServer()).delete('/api/mcp-oauth/fixture').expect(401);
  await request(app.getHttpServer()).delete('/api/mcp-oauth/fixture').auth(auth(), { type: 'bearer' }).expect(200);
  await expect(oauth.accessToken(userId, 'fixture')).rejects.toThrow();
 });

 it('authenticates persisted API keys and profiles and rejects revoked and expired keys', async () => {
  const keys = new ApiKeyService(db);
  const key = await keys.createApiKey(userId, { name: 'real-e2e' });
  const create = (secret: string) => request(app.getHttpServer()).post('/api/runs').auth(secret, { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'real API key identity' });
  const response = await create(key.key).expect(201);
  expect(response.body.run.userId).toBe(userId);
  expect((await db.apiKey.findUniqueOrThrow({ where: { id: key.id } })).lastUsedAt).toBeTruthy();
  await db.apiKey.update({ where: { id: key.id }, data: { revoked: true } });
  await create(key.key).expect(401);
  const expired = await keys.createApiKey(userId, { name: 'expired', expiresAt: new Date(Date.now() - 1000) });
  await create(expired.key).expect(401);
 });

 it('binds CLI grants to policyVersion and cleans expired and old superseded approvals', async () => {
  const sessionId = randomUUID(); const args = { path: 'bound.txt' };
  const response = await request(app.getHttpServer()).post('/api/approvals').auth(auth(), { type: 'bearer' })
   .send({ toolName: 'file_write', args, sessionId, policyVersion: 'cli-v1' }).expect(201);
  const id = response.body.id;
  expect(response.body.policyVersion).toBe('cli-v1');
  await request(app.getHttpServer()).post(`/api/approvals/${id}/decide`).auth(auth(), { type: 'bearer' }).send({ decision: 'approved', scope: 'session' }).expect(201);
  const lookup = (policyVersion: string) => request(app.getHttpServer()).post('/api/approvals/session-grant/lookup').auth(auth(), { type: 'bearer' })
   .send({ sessionId, toolName: 'file_write', args, policyVersion });
  expect((await lookup('cli-v1').expect(201)).body).toEqual({ granted: true });
  expect((await lookup('cli-v2').expect(201)).body).toEqual({ granted: false });
  await db.runApproval.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const old = await db.runApproval.create({ data: { userId, toolName: 'file_write', args, source: 'cli', status: 'superseded', updatedAt: new Date(Date.now() - 31 * 86400000) } });
  await new ApprovalMaintenanceService(db).sweep();
  expect(await db.runApproval.findUnique({ where: { id: old.id } })).toBeNull();
  expect(await db.runApproval.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'expired' });
  expect((await lookup('cli-v1').expect(201)).body).toEqual({ granted: false });
 });

 it('applies an approved Gateway checkpoint and refuses rollback over an external writer', async () => {
  const workspace = resolve(policyHome, 'workspace');
  writeFileSync(resolve(workspace, 'file.txt'), 'before');
  const run = await db.agentRun.create({ data: { userId, spaceId, spaceType: 'work', input: 'checkpoint', metadata: { sessionId: 'checkpoint-session' } } });
  await request(app.getHttpServer()).post(`/api/runs/${run.id}/tool-calls`).auth(auth(), { type: 'bearer' })
   .send({ id: 'checkpoint-call', name: 'checkpoint.write', input: { changes: [{ path: 'file.txt', content: 'after', expectedBefore: 'before' }] }, idempotencyKey: 'checkpoint-call' }).expect(201);
  worker.start(); await waitFor(run.id, 'waiting_for_approval');
  expect(readFileSync(resolve(workspace, 'file.txt'), 'utf8')).toBe('before');
  const approval = await db.runApproval.findFirstOrThrow({ where: { runId: run.id, status: 'pending' } });
  await request(app.getHttpServer()).post(`/api/runs/${run.id}/approvals/${approval.id}/decide`).auth(auth(), { type: 'bearer' }).send({ decision: 'approved' }).expect(201);
  await waitFor(run.id, 'succeeded'); worker.stop();
  expect(readFileSync(resolve(workspace, 'file.txt'), 'utf8')).toBe('after');
  const step = await db.runStep.findFirstOrThrow({ where: { runId: run.id, kind: 'tool_call' } });
  const checkpointId = (step.output as any).checkpointId;
  expect(typeof checkpointId).toBe('string');
  const service = new GatewayCheckpointService(db, { [spaceId]: workspace });
  writeFileSync(resolve(workspace, 'file.txt'), 'external');
  await expect(service.tools()[1].execute({ checkpointId }, { runId: run.id, userId, toolCallId: 'rollback' })).rejects.toThrow('conflict');
  expect(readFileSync(resolve(workspace, 'file.txt'), 'utf8')).toBe('external');
  writeFileSync(resolve(workspace, 'file.txt'), 'after');
  await service.tools()[1].execute({ checkpointId }, { runId: run.id, userId, toolCallId: 'rollback' });
  expect(readFileSync(resolve(workspace, 'file.txt'), 'utf8')).toBe('before');
 }, 20000);

 it('cancels descendants immediately with the parent before another Worker poll', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'cancel tree' }).expect(201);
  const parentId = response.body.run.id;
  const child = await request(app.getHttpServer()).post(`/api/runs/${parentId}/subagents`).auth(auth(), { type: 'bearer' })
   .send({ toolCallId: 'child', agent: 'worker', prompt: 'child work' }).expect(201);
  const grandchild = await request(app.getHttpServer()).post(`/api/runs/${child.body.id}/subagents`).auth(auth(), { type: 'bearer' })
   .send({ toolCallId: 'grandchild', agent: 'worker', prompt: 'grandchild work' }).expect(201);
  await db.runStep.create({ data: { runId: grandchild.body.id, seq: 1, kind: 'tool_call', status: 'started', input: { name: 'file_write' } } });
  await request(app.getHttpServer()).post(`/api/runs/${parentId}/cancel`).auth(auth(), { type: 'bearer' }).send({}).expect(201);
  const ids = [parentId, child.body.id, grandchild.body.id];
  expect((await db.agentRun.findMany({ where: { id: { in: ids } } })).every(run => run.status === 'cancelled' && run.executionToken === null)).toBe(true);
  expect(await db.outboxEvent.count({ where: { aggregateId: { in: ids }, status: 'pending', topic: { in: ['run.requested', 'tool.requested'] } } })).toBe(0);
  expect(await db.runStep.findFirstOrThrow({ where: { runId: grandchild.body.id, kind: 'tool_call' } })).toMatchObject({ status: 'unknown', output: null });
  expect((await db.runStep.findMany({ where: { runId: { in: ids }, kind: 'subagent' } })).every(step => step.status === 'failed')).toBe(true);
 });

 it('prevents child agents from bypassing their tool policy through HTTP tool requests', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'restricted parent' }).expect(201);
  const parentId = response.body.run.id;
  const child = await request(app.getHttpServer()).post(`/api/runs/${parentId}/subagents`).auth(auth(), { type: 'bearer' })
   .send({ toolCallId: 'restricted-child', agent: 'reader', prompt: 'read only' }).expect(201);
  await db.outboxEvent.deleteMany({ where: { aggregateId: child.body.id, topic: 'run.requested' } });
  await request(app.getHttpServer()).post(`/api/runs/${child.body.id}/tool-calls`).auth(auth(), { type: 'bearer' })
   .send({ id: 'forbidden-write', name: 'counter.increment', input: { key: 'forbidden' }, idempotencyKey: 'forbidden-write' }).expect(201);
  worker.start(); await waitFor(child.body.id, 'failed'); await waitFor(parentId, 'failed'); worker.stop();
  expect(await db.runApproval.count({ where: { runId: child.body.id } })).toBe(0);
  expect(await db.auditLog.count({ where: { runId: child.body.id, action: 'tool.execute' } })).toBe(0);
  const step = await db.runStep.findFirstOrThrow({ where: { runId: parentId, kind: 'subagent' } });
  expect(step.status).toBe('failed');
 });

 it('streams a provider tool call through cancellation, retry, session approval and completion', async () => {
  const requestsBeforeCancellation = providerContract.requests.length;
  const session = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'Provider fixture' } });
  const response = await request(app.getHttpServer()).post('/api/runs').auth(auth(), { type: 'bearer' })
   .send({ space: { id: spaceId, type: 'work' }, input: 'Provider contract',
    metadata: { modelId: providerModelId, sessionId: session.id, systemPrompt: 'System fixture', appendSystemPrompt: 'Extra fixture' } }).expect(201);
  const runId = response.body.run.id;
  await request(app.getHttpServer()).post(`/api/runs/${runId}/cancel`).auth(auth(), { type: 'bearer' }).send({}).expect(201);
  expect(await db.agentRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'cancelled' });
  expect(await db.runStep.count({ where: { runId } })).toBe(0);
  expect(providerContract.requests).toHaveLength(requestsBeforeCancellation);
  await request(app.getHttpServer()).post(`/api/runs/${runId}/retry`).auth(auth(), { type: 'bearer' }).send({}).expect(201);

  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: true });
  try {
   worker.start();
   await waitFor(runId, 'waiting_for_approval');
   expect(providerContract.requests.slice(requestsBeforeCancellation)).toHaveLength(1);
   const approval = await db.runApproval.findFirstOrThrow({ where: { runId, status: 'pending' } });
   expect(approval.argsHash).toBeTruthy();
   expect(approval.policyVersion).toBeTruthy();
   expect(await db.runStep.count({ where: { runId, kind: 'tool_call', status: 'succeeded' } })).toBe(0);
   await request(app.getHttpServer()).post(`/api/runs/${runId}/approvals/${approval.id}/decide`)
    .auth(auth(), { type: 'bearer' }).send({ decision: 'approved', scope: 'session' }).expect(201);
   await waitFor(runId, 'succeeded');
   expect(await db.runApproval.findUniqueOrThrow({ where: { id: approval.id } }))
    .toMatchObject({ status: 'approved', scope: 'session' });
   const steps = await db.runStep.findMany({ where: { runId }, orderBy: { seq: 'asc' } });
   expect(steps.map(({ kind, status }) => [kind, status])).toEqual([
    ['model_call', 'succeeded'], ['approval', 'succeeded'], ['tool_call', 'succeeded'], ['model_call', 'succeeded'],
   ]);
   expect(providerContract.requests.slice(requestsBeforeCancellation)).toHaveLength(2);
   expect(providerContract.requests[requestsBeforeCancellation]).toMatchObject({ model: providerModelId, stream: true });
   expect(providerContract.requests[requestsBeforeCancellation].tools).toEqual(expect.arrayContaining([
    expect.objectContaining({ function: expect.objectContaining({ name: 'echo' }) }),
   ]));
   for (const providerRequest of providerContract.requests.slice(requestsBeforeCancellation)) {
    expect(providerRequest.messages.filter(message => message.role === 'system')).toEqual([
     expect.objectContaining({ role: 'system', content: 'System fixture\n\nExtra fixture' }),
    ]);
    expect(providerRequest.messages.some(message => message.role === 'user')).toBe(true);
   }
   const toolMessage = providerContract.requests[requestsBeforeCancellation + 1].messages.find(({ role }) => role === 'tool');
   expect(toolMessage).toMatchObject({ tool_call_id: 'provider-echo' });
   expect(JSON.parse(toolMessage!.content!)).toEqual({ text: 'provider-round-trip' });
   expect(steps[3].output).toMatchObject({ text: 'OCEAN_PROVIDER_OK', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } });
  } finally {
   worker.stop();
   registry.register(echo);
  }
 }, 30000);

 it('applies permission hook replacements and interrupts through the HTTP Worker', async () => {
  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: true });
  const hookFile = resolve(policyHome, 'hooks.json');
  const start = providerContract.requests.length;
  try {
   worker.start();
   for (const decision of [
    { behavior: 'allow', updatedInput: { text: 'hook-replacement' } },
    { behavior: 'deny', message: 'hook-interrupted', interrupt: true },
   ]) {
    const session = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'Permission hook' } });
    const verdict = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } });
    writeFileSync(hookFile, JSON.stringify({
     trustedSpaces: [spaceId],
     hooks: { PermissionRequest: [{ matcher: '^echo$', hooks: [{ type: 'command', command: `printf '%s' '${verdict}'` }] }] },
    }), { mode: 0o600 });
    const before = providerContract.requests.length;
    const response = await request(app.getHttpServer()).post('/api/chat').auth(auth(), { type: 'bearer' })
     .send({ messages: [{ role: 'user', content: 'Permission hook fixture' }], modelId: providerModelId,
      sessionId: session.id, nonInteractive: true, toolNames: ['echo'], stream: true }).expect(200);
    const run = await db.agentRun.findFirstOrThrow({ where: { userId, metadata: { path: ['sessionId'], equals: session.id } } });
    expect(await db.runApproval.count({ where: { runId: run.id } })).toBe(0);
    if (decision.behavior === 'allow') {
     expect(run.status).toBe('succeeded');
     expect(response.text).toContain('hook-replacement');
     const requests = providerContract.requests.slice(before);
     expect(requests).toHaveLength(2);
     expect(requests[1].messages.find(message => message.role === 'tool')?.content).toBe('{"text":"hook-replacement"}');
    } else {
     expect(run.status).toBe('cancelled');
     expect(response.text).toContain('"finishReason":"interrupted"');
     expect(providerContract.requests.slice(before)).toHaveLength(1);
     expect(await db.runStep.count({ where: { runId: run.id, kind: 'tool_call' } })).toBe(0);
    }
   }
  } finally {
   worker.stop();
   registry.register(echo);
   writeFileSync(hookFile, JSON.stringify({ trustedSpaces: [spaceId], hooks: {} }), { mode: 0o600 });
   providerContract.requests.splice(start);
  }
 }, 30000);

 const cli = process.env.OCEAN_E2E_CLI_ENTRY;
 (cli ? it : it.skip)('applies print tool selection across CLI, HTTP, Worker and provider', async () => {
  const execute = promisify(execFile);
  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: false });
  const firstRequest = providerContract.requests.length;
  try {
   worker.start();
   for (const [selection, expectedTools] of [['echo', ['echo']], ['', []], ['default', undefined]] as const) {
    const session = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'Tool selection' } });
    const before = providerContract.requests.length;
    const { stdout } = await execute(process.execPath, [
     cli!, '-p', '--gateway', '--tools', selection, '--resume', session.id, '--model', providerModelId,
     '--output-format', 'json', 'Tool selection fixture',
    ], {
     cwd: policyHome,
     env: { ...process.env, OCEAN_GATEWAY_URL: await app.getUrl(), OCEAN_API_KEY: auth() },
     timeout: 10000,
    });
    expect(stdout).toContain('OCEAN_PROVIDER_OK');
    const run = await db.agentRun.findFirstOrThrow({
     where: { userId, metadata: { path: ['sessionId'], equals: session.id } },
    });
    const requests = providerContract.requests.slice(before);
    expect(requests).toHaveLength(selection === '' ? 1 : 2);
    for (const providerRequest of requests) {
     const names = (providerRequest.tools ?? []).map(tool => tool.function.name);
     if (expectedTools) expect(names).toEqual(expectedTools);
     else expect(names.length).toBeGreaterThan(1);
     expect(names).not.toContain('ask_user');
    }
    if (expectedTools) expect(run.metadata).toMatchObject({ toolNames: expectedTools });
    else expect(run.metadata).not.toHaveProperty('toolNames');
   }
  } finally {
   worker.stop();
   registry.register(echo);
   providerContract.requests.splice(firstRequest);
  }
 }, 35000);

 (cli ? it : it.skip)('routes Gateway print approvals to the stdio host', async () => {
  const echo = registry.get('echo')!;
  registry.register({ ...echo, requiresApproval: true });
  const start = providerContract.requests.length;
  try {
   worker.start();
   for (const [behavior, replacement, interrupt] of [
    ['allow', undefined], ['allow', { text: 'sdk-replacement' }], ['allow', { text: 42 }], ['deny', undefined], ['deny', undefined, true],
   ] as const) {
    const session = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'SDK approval' } });
    const child = spawn(process.execPath, [
     cli!, '-p', '--gateway', '--tools', 'echo', '--resume', session.id, '--model', providerModelId,
     '--input-format', 'stream-json', '--output-format', 'stream-json', '--permission-prompt-tool', 'stdio',
    ], {
     cwd: policyHome,
     env: { ...process.env, OCEAN_GATEWAY_URL: await app.getUrl(), OCEAN_API_KEY: auth() },
     stdio: ['pipe', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    const timer = setTimeout(() => child.kill(), 10000);
    const lines = createInterface({ input: child.stdout });
    let requestCount = 0;
    const results: unknown[] = [];
    let status: string | undefined;
    let errors = '';
    child.stderr.on('data', chunk => { errors += String(chunk); });
    child.stdin.write(JSON.stringify({ type: 'user', text: 'Approval fixture' }) + '\n');
    try {
     for await (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === 'control_request') {
       requestCount++;
       expect(event.request).toMatchObject({ subtype: 'can_use_tool', tool_name: 'echo', tool_use_id: 'provider-echo' });
       child.stdin.write(JSON.stringify({
        type: 'control_response',
        response: { subtype: 'success', request_id: event.request_id, response: { behavior, toolUseID: 'provider-echo', updatedInput: replacement, interrupt } },
       }) + '\n');
      }
      if (event.type === 'tool_result') results.push(event.result);
      if (event.type === 'result') {
       status = event.status;
       child.stdin.end();
      }
     }
     const [exitCode] = await exited;
     expect({ exitCode, errors, requestCount, status }).toMatchObject({
      exitCode: 0, requestCount: 1, status: interrupt ? 'interrupted' : 'succeeded',
     });
     const run = await db.agentRun.findFirstOrThrow({ where: { userId, metadata: { path: ['sessionId'], equals: session.id } } });
     expect(await db.runApproval.findFirst({ where: { runId: run.id } })).toMatchObject({
      status: behavior === 'allow' ? 'approved' : 'rejected', scope: 'once',
     });
     expect(await db.runStep.count({ where: { runId: run.id, kind: 'tool_call' } })).toBe(interrupt ? 0 : 1);
     if (behavior === 'allow') {
      const approval = await db.runApproval.findFirstOrThrow({ where: { runId: run.id } });
      expect(approval.args).toEqual({ text: 'provider-round-trip' });
      expect(results).toEqual([typeof replacement?.text === 'number'
       ? { error: 'Invalid replacement tool input.' } : { text: replacement?.text ?? 'provider-round-trip' }]);
      expect(await db.auditLog.count({ where: { runId: run.id, action: 'tool.execute' } }))
       .toBe(typeof replacement?.text === 'number' ? 0 : 1);
     } else {
      expect(results).toEqual(interrupt ? [] : [{ error: 'SDK host denied tool echo.' }]);
      expect(await db.auditLog.count({ where: { runId: run.id, action: 'tool.execute' } })).toBe(0);
     }
    } finally {
     clearTimeout(timer);
     lines.close();
     if (child.exitCode === null) child.kill();
     await exited;
    }
   }
  } finally {
   registry.register(echo);
   providerContract.requests.splice(start);
   worker.stop();
  }
 }, 30000);

 (cli ? it : it.skip)('interrupts an active provider stream from CLI stdin and continues the session', async () => {
  const session = await db.session.create({ data: { userId, spaceId, channel: 'cli', title: 'Control protocol' } });
  const firstRequest = providerContract.requests.length;
  const endpoint = await app.getUrl();
  const child = spawn(process.execPath, [
   cli!, '-p', '--gateway', '--tools', '', '--resume', session.id,
   '--input-format', 'stream-json', '--output-format', 'stream-json',
  ], {
   cwd: policyHome,
   env: { ...process.env, OCEAN_GATEWAY_URL: endpoint, OCEAN_API_KEY: auth() },
   stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  const lines = createInterface({ input: child.stdout });
  const events: any[] = [];
  lines.on('line', line => { try { events.push(JSON.parse(line)); } catch { /* checked through expected events */ } });
  let errors = '';
  child.stderr.on('data', chunk => { errors += String(chunk); });
  const send = (message: object) => child.stdin.write(JSON.stringify(message) + '\n');
  const control = (id: string, request: object) => send({ type: 'control_request', request_id: id, request });
  const waitUntil = async (condition: () => boolean) => {
   const deadline = Date.now() + 8000;
   while (!condition()) {
    if (Date.now() >= deadline || child.exitCode !== null) throw new Error(`CLI control timed out: ${errors} ${JSON.stringify(events)}`);
    await new Promise(resolve => setTimeout(resolve, 30));
   }
  };

  try {
   worker.start();
   control('init', { subtype: 'initialize', systemPrompt: 'Control fixture' });
   control('model', { subtype: 'set_model', model: providerModelId });
   send({ type: 'user', id: 'first', text: 'Hold provider until interrupted' });
   await waitUntil(() => providerContract.requests.length > firstRequest);
   const run = await db.agentRun.findFirstOrThrow({ where: { userId, metadata: { path: ['sessionId'], equals: session.id } } });
   control('interrupt', { subtype: 'interrupt' });
   await waitUntil(() => events.some(event => event.type === 'result' && event.requestId === 'first' && event.status === 'interrupted'));
   await waitFor(run.id, 'cancelled');
   await waitUntil(() => providerContract.interruptedRequests.length > 0);
   send({ type: 'user', id: 'next', text: 'Finish without tools' });
   child.stdin.end();
   await waitUntil(() => events.some(event => event.type === 'result' && event.requestId === 'next' && event.status === 'succeeded'));
   expect(await exited).toEqual([0, null]);
   expect(events.filter(event => event.type === 'control_response').map(event => event.response)).toEqual([
    expect.objectContaining({ request_id: 'init', subtype: 'success' }),
    expect.objectContaining({ request_id: 'model', subtype: 'success' }),
    expect.objectContaining({ request_id: 'interrupt', subtype: 'success' }),
   ]);
   expect(providerContract.requests.slice(firstRequest)).toHaveLength(2);
   expect(providerContract.requests.at(-1)?.messages).toContainEqual(expect.objectContaining({ role: 'system', content: 'Control fixture' }));
  } finally {
   child.kill();
   lines.close();
   await exited;
   worker.stop();
   providerContract.requests.splice(firstRequest);
   providerContract.interruptedRequests.length = 0;
  }
 }, 30000);

});
