import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SsoAuthGuard } from '../src/auth/sso.guard';
import { UserService } from '../src/auth/user.service';
import { ApiKeyService } from '../src/auth/api-key.service';
import { RunController } from '../src/run/run.controller';
import { ExternalApprovalController } from '../src/run/external-approval.controller';
import { RunService } from '../src/run/run.service';
import { ArtifactStore } from '../src/artifact/artifact.store';

describe('Gateway HTTP boundary', () => {
 let app: INestApplication;
 const jwt = new JwtService({ secret: 'e2e-only-local-secret' });
 const service = {
  create: jest.fn(async (userId, input) => ({ id: 'run-test', userId, ...input })),
  createExternalApproval: jest.fn(async (userId, input) => ({ id: 'approval-test', userId, status: 'pending', ...input })),
  decideExternalApproval: jest.fn(async (id, userId, decision) => ({ id, userId, status: decision })),
 };
 const token = () => jwt.sign({ sub: 'user-test', workId: 'tester' }, { expiresIn: '1m' });
 beforeAll(async () => {
  const module = await Test.createTestingModule({
   controllers: [RunController, ExternalApprovalController],
   providers: [
    { provide: RunService, useValue: service },
    { provide: ArtifactStore, useValue: {} },
    { provide: JwtService, useValue: jwt },
    { provide: UserService, useValue: { getUserFullProfile: async () => ({ name: 'Tester' }) } },
    { provide: ApiKeyService, useValue: { findUserByApiKey: async () => null } },
    { provide: APP_GUARD, useClass: SsoAuthGuard },
   ],
  }).compile();
  app = module.createNestApplication(); await app.init();
 });
 afterAll(async () => { await app?.close(); });
 beforeEach(() => jest.clearAllMocks());
 it('loads the production module including real AI SDK dependencies', () => { expect(AppModule).toBeDefined(); });
 it('rejects unauthenticated requests before creating a Run', async () => {
  await request(app.getHttpServer()).post('/api/runs').send({}).expect(401);
  expect(service.create).not.toHaveBeenCalled();
 });
 it('rejects invalid input after JWT authentication', async () => {
  await request(app.getHttpServer()).post('/api/runs').auth(token(), { type: 'bearer' }).send({}).expect(400);
  expect(service.create).not.toHaveBeenCalled();
 });
 it('creates a Run with the authenticated database identity', async () => {
  const response = await request(app.getHttpServer()).post('/api/runs').auth(token(), { type: 'bearer' })
   .send({ space: { type: 'work', id: 'space-test' }, input: 'hello' }).expect(201);
  expect(response.body.userId).toBe('user-test');
  expect(service.create).toHaveBeenCalledWith('user-test', expect.objectContaining({ input: 'hello' }));
 });
 it('creates and approves a session-bound request through HTTP', async () => {
  const response = await request(app.getHttpServer()).post('/api/approvals').auth(token(), { type: 'bearer' })
   .send({ toolName: 'file_write', args: { path: 'a' }, sessionId: 'session-test' }).expect(201);
  expect(response.body).toMatchObject({ userId: 'user-test', sessionId: 'session-test', status: 'pending' });
  const decision = await request(app.getHttpServer()).post('/api/approvals/approval-test/decide').auth(token(), { type: 'bearer' })
   .send({ decision: 'approved' }).expect(201);
  expect(decision.body.status).toBe('approved');
  expect(service.decideExternalApproval).toHaveBeenCalledWith('approval-test', 'user-test', 'approved');
 });
});
