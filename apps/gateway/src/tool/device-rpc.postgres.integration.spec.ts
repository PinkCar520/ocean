import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { DeviceRpcBroker } from './device-rpc.broker';
import { DeviceRpcDispatcher } from '../chat/device-rpc.dispatcher';

// Opt in explicitly: every run creates and drops its own randomly named schema.
const integration = process.env.OCEAN_DEVICE_RPC_PG_TEST === '1' ? describe : describe.skip;
integration('device RPC against PostgreSQL', () => {
  const schema = `ocean_verify_${randomBytes(8).toString('hex')}`;
  let admin: Pool;
  let pool: Pool;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (url.hostname === 'postgres') url.hostname = '127.0.0.1';
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('This test requires a local PostgreSQL server.');
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TABLE "${schema}"."users" ("id" TEXT PRIMARY KEY, "workId" TEXT NOT NULL UNIQUE);
      CREATE TABLE "${schema}"."sessions" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "spaceId" TEXT NOT NULL);
      CREATE TABLE "${schema}"."agent_runs" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "spaceId" TEXT NOT NULL, "status" TEXT NOT NULL, "metadata" JSONB);
      CREATE TABLE "${schema}"."outbox_events" (
        "id" TEXT PRIMARY KEY, "topic" TEXT NOT NULL, "aggregateType" TEXT NOT NULL, "aggregateId" TEXT NOT NULL,
        "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "priorityRank" INTEGER NOT NULL DEFAULT 1,
        "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3), "lockedBy" TEXT,
        "attempts" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT, "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "${schema}"."users" VALUES ('u', 'alice');
      INSERT INTO "${schema}"."sessions" VALUES ('s', 'u', 'work');
      INSERT INTO "${schema}"."agent_runs" VALUES ('r', 'u', 'work', 'running', '{"sessionId":"s"}');
    `);
    pool = new Pool({ connectionString: url.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  }, 15_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  }, 15_000);

  it('atomically dispatches one persisted request across competing gateways and reuses the result', async () => {
    const broker = new DeviceRpcBroker(prisma);
    const rpc = { getOnlineUsers: () => ['alice'], sendToCli: jest.fn().mockResolvedValue({ kind: 'notebook', parts: [{ type: 'text', text: 'cell' }] }) };
    const first = new DeviceRpcDispatcher(prisma, rpc as never);
    const second = new DeviceRpcDispatcher(prisma, rpc as never);
    const context = { runId: 'r', userId: 'u', toolCallId: 'call' };
    const request = broker.request('notebook_read', { path: 'note.ipynb' }, context);
    const deadline = Date.now() + 5000;
    while (!(await prisma.outboxEvent.findFirst({ where: { topic: 'device.rpc' } }))) {
      if (Date.now() > deadline) throw new Error('Device request was not persisted.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await Promise.all([first.poll(), second.poll()]);
    expect(await request).toMatchObject({ kind: 'notebook' });
    expect(rpc.sendToCli).toHaveBeenCalledTimes(1);
    expect(await broker.request('notebook_read', { path: 'note.ipynb' }, context)).toMatchObject({ kind: 'notebook' });
    expect(rpc.sendToCli).toHaveBeenCalledTimes(1);
  }, 15_000);
});
