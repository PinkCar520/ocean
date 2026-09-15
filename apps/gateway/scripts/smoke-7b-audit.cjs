/* 7b 真实 DB 冒烟：审计闭环（工具执行记录 + 授权记录 + 查询隔离）。需先 build。 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ocean?schema=public';
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

const { AuditService } = require('../dist/apps/gateway/src/audit/audit.service');
const { SpaceService } = require('../dist/apps/gateway/src/space/space.service');

async function main() {
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg); console.log('  ✓ ' + msg); };

  const user = await prisma.user.findFirst({ where: { memberships: { some: {} } }, select: { id: true } });
  const other = await prisma.user.findFirst({ where: { id: { not: user.id } }, select: { id: true } });
  assert(user && other, 'seed users exist');

  const audit = new AuditService(prisma, new SpaceService(prisma));

  console.log('\n[审计写入]');
  // 工具执行审计（完整来源：谁/哪个 Space/什么输入/因何授权）
  await audit.record({
    actorUserId: user.id,
    action: 'tool.execute',
    spaceId: 'work',
    runId: 'smoke-run-1',
    toolName: 'fs.write',
    inputJson: { path: '/tmp/audit-smoke.txt', content: 'hi' },
    authorization: 'approval',
  });
  const rows = await prisma.auditLog.findMany({ where: { actorUserId: user.id, action: 'tool.execute' } });
  const mine = rows.find((r) => r.runId === 'smoke-run-1');
  assert(!!mine, 'tool.execute audit row persisted');
  assert(mine.spaceId === 'work' && mine.toolName === 'fs.write', 'provenance fields stored');
  assert(JSON.stringify(mine.inputJson).includes('/tmp/audit-smoke.txt'), 'input snapshot stored');
  assert(mine.authorization === 'approval', 'authorization basis stored');

  console.log('\n[授权审计]');
  const space = new SpaceService(prisma, audit);
  const g = await space.createGrant(user.id, { toSpaceId: 'work', purpose: 'smoke-audit' });
  const grantLog = await prisma.auditLog.findFirst({
    where: { actorUserId: user.id, action: 'grant.created', authorization: `grant:${g.id}` },
  });
  assert(!!grantLog, 'grant.created audited with grant id');
  await space.revokeGrant(user.id, g.id);
  const revokeLog = await prisma.auditLog.findFirst({
    where: { actorUserId: user.id, action: 'grant.revoked', inputJson: { path: ['grantId'], equals: g.id } },
  });
  assert(!!revokeLog, 'grant.revoked audited');

  console.log('\n[查询隔离]');
  // 本人可见自己的日志
  const list = await audit.list(user.id, { spaceId: 'work' });
  assert(list.some((l) => l.id === mine.id), 'caller sees own audit rows');
  // 他人不可见（actorUserId 强制本人）
  const otherList = await audit.list(other.id, { spaceId: 'work' });
  assert(!otherList.some((l) => l.id === mine.id), 'other actor cannot see my audit rows');
  // 未知 space → 404/403
  let denied = false;
  try { await audit.list(user.id, { spaceId: 'nonexistent-space' }); } catch { denied = true; }
  assert(denied, 'unknown space filter rejected');

  // 清理
  await prisma.auditLog.deleteMany({ where: { actorUserId: user.id, runId: 'smoke-run-1' } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: user.id, action: { in: ['grant.created', 'grant.revoked'] }, inputJson: { path: ['grantId'], equals: g.id } } });
  await prisma.contextGrant.deleteMany({ where: { id: g.id } });
  console.log('  ✓ smoke data cleaned');
  console.log('\nALL 7b SMOKE ASSERTIONS PASSED');
}

main()
  .catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
