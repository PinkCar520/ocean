import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const integration = process.env.OCEAN_TOOL_IDEMPOTENCY_PG_TEST === '1' ? describe : describe.skip;
integration('Tool idempotency identity against PostgreSQL', () => {
  const schema = `ocean_idem_${randomBytes(8).toString('hex')}`;
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
      CREATE TABLE "${schema}"."run_steps" (
        "id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL, "seq" INTEGER NOT NULL,
        "kind" TEXT NOT NULL, "status" TEXT NOT NULL,
        "input" JSONB, "output" JSONB, "error" TEXT, "checkpoint" JSONB,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3)
      );
    `);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}"."run_approvals" (
      "id" TEXT PRIMARY KEY, "sessionId" TEXT, "toolName" TEXT NOT NULL, "status" TEXT NOT NULL
    ); INSERT INTO "${schema}"."run_approvals" VALUES ('legacy', 'session-1', 'file_write', 'approved')`);
    await admin.query(readFileSync(resolve(process.cwd(), 'prisma/migrations/20261116000002_approval_binding/migration.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(process.cwd(), 'prisma/migrations/20261116000003_tool_idempotency/migration.sql'), 'utf8'));
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

  it('preserves legacy once approvals and persists session policy bindings after migration', async () => {
    const legacy = await admin.query(`SELECT * FROM "${schema}"."run_approvals" WHERE id = 'legacy'`);
    expect(legacy.rows[0]).toMatchObject({ scope: 'once', policyVersion: null, policyRuleId: null, argsHash: null });
    await admin.query(`UPDATE "${schema}"."run_approvals" SET scope = 'session', "policyVersion" = 'v1', "policyRuleId" = 'rule-1', "argsHash" = 'digest' WHERE id = 'legacy'`);
    const bound = await admin.query(`SELECT * FROM "${schema}"."run_approvals" WHERE "sessionId" = 'session-1' AND "toolName" = 'file_write' AND status = 'approved'`);
    expect(bound.rows).toHaveLength(1);
    expect(bound.rows[0]).toMatchObject({ scope: 'session', policyVersion: 'v1', policyRuleId: 'rule-1', argsHash: 'digest' });
  });

  it('rejects a second tool_call with the same run/idempotency key', async () => {
    await prisma.runStep.create({
      data: { id: 's1', runId: 'r1', seq: 1, kind: 'tool_call', status: 'started', idempotencyKey: 'key-1', input: { name: 'file_write' } },
    });
    await expect(prisma.runStep.create({
      data: { id: 's2', runId: 'r1', seq: 2, kind: 'tool_call', status: 'started', idempotencyKey: 'key-1', input: { name: 'file_write' } },
    })).rejects.toMatchObject({ code: 'P2002' });
    const found = await prisma.runStep.findFirst({ where: { runId: 'r1', kind: 'tool_call', idempotencyKey: 'key-1' } });
    expect(found?.id).toBe('s1');
  }, 15_000);

  it('still allows distinct keys and rows without a key', async () => {
    await expect(prisma.runStep.create({
      data: { id: 's3', runId: 'r1', seq: 3, kind: 'tool_call', status: 'started', idempotencyKey: 'key-2', input: {} },
    })).resolves.toBeDefined();
    await expect(prisma.runStep.create({
      data: { id: 's4', runId: 'r1', seq: 4, kind: 'tool_call', status: 'started', idempotencyKey: null, input: {} },
    })).resolves.toBeDefined();
    await expect(prisma.runStep.create({
      data: { id: 's5', runId: 'r1', seq: 5, kind: 'tool_call', status: 'started', idempotencyKey: null, input: {} },
    })).resolves.toBeDefined();
  }, 15_000);
});
