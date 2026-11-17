import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { LeasedRunJob } from '@ocean/contracts';
import { claimRun, verifyRun, LostRunOwnership } from './run-ownership';

// Opt in explicitly: every run creates and drops its own randomly named schema.
const integration = process.env.OCEAN_RUN_OWNERSHIP_PG_TEST === '1' ? describe : describe.skip;
integration('Run execution ownership against PostgreSQL', () => {
  const schema = `ocean_owner_${randomBytes(8).toString('hex')}`;
  let admin: Pool;
  let pool: Pool;
  let prisma: PrismaClient;

  const job = (attempts: number): LeasedRunJob => ({
    id: 'job_1',
    topic: 'run.requested',
    payload: { version: 1, runId: 'run_1', userId: 'user_1' },
    attempts,
    lockedAt: new Date().toISOString(),
  }) as LeasedRunJob;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (url.hostname === 'postgres') url.hostname = '127.0.0.1';
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('This test requires a local PostgreSQL server.');
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TABLE "${schema}"."agent_runs" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "status" TEXT NOT NULL,
        "executionToken" TEXT, "executionJobId" TEXT, "executionAttempt" INTEGER
      );
      CREATE TABLE "${schema}"."outbox_events" (
        "id" TEXT PRIMARY KEY, "topic" TEXT NOT NULL, "aggregateId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
        "lockedAt" TIMESTAMP(3), "lockedBy" TEXT
      );
      INSERT INTO "${schema}"."agent_runs" VALUES ('run_1', 'user_1', 'queued', NULL, NULL, NULL);
      INSERT INTO "${schema}"."outbox_events" VALUES ('job_1', 'run.requested', 'run_1', 'pending', 1, NOW(), 'w0');
    `);
    pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema}` });
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

  it('lets exactly one of two competing workers claim the Run and fences the loser', async () => {
    const results = await Promise.all([
      prisma.$transaction((tx) => claimRun(tx, job(1), 'worker-a', 30_000)),
      prisma.$transaction((tx) => claimRun(tx, job(1), 'worker-b', 30_000)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? 'worker-a' : 'worker-b';
    const loser = results[0] ? 'worker-b' : 'worker-a';
    await expect(prisma.$transaction((tx) => verifyRun(tx, job(1), loser, 30_000))).rejects.toBeInstanceOf(LostRunOwnership);
    await expect(prisma.$transaction((tx) => verifyRun(tx, job(1), winner, 30_000))).resolves.toBeUndefined();
  }, 15_000);

  it('allows takeover only after the previous lease expires and fences the stale token', async () => {
    await admin.query(`UPDATE "${schema}"."agent_runs" SET "executionToken" = NULL, "executionJobId" = NULL WHERE id = 'run_1'`);
    await admin.query(`UPDATE "${schema}"."outbox_events" SET "attempts" = 2, "lockedAt" = NOW() - INTERVAL '2 minutes' WHERE id = 'job_1'`);
    expect(await prisma.$transaction((tx) => claimRun(tx, job(2), 'worker-c', 30_000))).toBe(false);
    await admin.query(`UPDATE "${schema}"."outbox_events" SET "lockedAt" = NOW() WHERE id = 'job_1'`);
    expect(await prisma.$transaction((tx) => claimRun(tx, job(2), 'worker-c', 30_000))).toBe(true);
    await expect(prisma.$transaction((tx) => verifyRun(tx, job(2), 'worker-a', 30_000))).rejects.toBeInstanceOf(LostRunOwnership);
    await expect(prisma.$transaction((tx) => verifyRun(tx, job(2), 'worker-c', 30_000))).resolves.toBeUndefined();
  }, 15_000);
  it('fences a delayed write after lease expiry inside an already-open transaction', async () => {
    await admin.query(`UPDATE "${schema}"."agent_runs" SET "executionToken" = NULL, "executionJobId" = NULL WHERE id = 'run_1'`);
    await admin.query(`UPDATE "${schema}"."outbox_events" SET attempts = 3, "lockedAt" = clock_timestamp() WHERE id = 'job_1'`);
    expect(await prisma.$transaction(tx => claimRun(tx, job(3), 'delayed-worker', 1000))).toBe(true);
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SELECT pg_sleep(1.2)');
      await verifyRun(tx, job(3), 'delayed-worker', 1000);
      await tx.$executeRawUnsafe(`UPDATE agent_runs SET status = 'failed' WHERE id = 'run_1'`);
    })).rejects.toBeInstanceOf(LostRunOwnership);
    expect((await admin.query(`SELECT status FROM "${schema}".agent_runs WHERE id = 'run_1'`)).rows[0].status).toBe('queued');
  }, 15000);

});
