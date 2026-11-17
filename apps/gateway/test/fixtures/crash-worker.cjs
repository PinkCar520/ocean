require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node', resolvePackageJsonExports: false, resolvePackageJsonImports: false } });
require('reflect-metadata');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { OutboxService } = require('../../src/run/outbox.service.ts');
const { RunRunner } = require('../../src/worker/run-runner.ts');
const { ToolExecutor } = require('../../src/worker/tool-executor.ts');
const { WorkerService } = require('../../src/worker/worker.service.ts');
const { ToolRegistry } = require('../../src/tool/tool.registry.ts');
const { MetricsService } = require('../../src/obs/metrics.service.ts');
const { AuditService } = require('../../src/audit/audit.service.ts');
const { SubagentRunsService } = require('../../src/run/subagent-runs.service.ts');
const { SimModelGateway } = require('../../src/ai/sim-model-gateway.ts');
async function main() {
 const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 const db = new PrismaClient({ adapter: new PrismaPg(pool) });
 const outbox = new OutboxService(db);
 const registry = new ToolRegistry();
 if (process.env.CRASH_EFFECT_FILE) {
  const tool = registry.get('counter.increment');
  registry.register({ ...tool, effect: 'non-idempotent-write', async execute() {
   require('node:fs').appendFileSync(process.env.CRASH_EFFECT_FILE, 'effect\n');
   await new Promise(() => {});
  } });
 }
 const metrics = new MetricsService();
 const worker = new WorkerService(new RunRunner(db, new SimModelGateway(Number(process.env.CRASH_MODEL_DELAY_MS || 0)), outbox, registry, metrics),
  new ToolExecutor(db, registry, outbox, metrics, new AuditService(db)), outbox, db, new SubagentRunsService(db, outbox));
 await worker.onModuleInit();
 process.on('SIGTERM', async () => { worker.stop(); await db.$disconnect(); await pool.end(); process.exit(0); });
}
main().catch(error => { console.error(error); process.exit(1); });
