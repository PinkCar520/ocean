/* 7c 真实 DB 冒烟：数据导出 + 账号级联删除。需先 build。 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ocean?schema=public';
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });
const { PrivacyService } = require('../dist/apps/gateway/src/privacy/privacy.service');

async function main() {
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg); console.log('  ✓ ' + msg); };
  // 临时用户 + 数据
  const user = await prisma.user.create({ data: { workId: `smoke-7c-${Date.now()}` } });
  const lifeId = `life-${user.id}`;
  await prisma.space.upsert({ where: { id: lifeId }, update: {}, create: { id: lifeId, slug: lifeId, name: 'Smoke Life', type: 'life' } });
  await prisma.membership.create({ data: { userId: user.id, spaceId: lifeId, role: 'owner' } });
  await prisma.session.create({ data: { userId: user.id, title: 'smoke', spaceId: 'work' } });
  await prisma.lifeMemory.create({ data: { spaceId: lifeId, content: 'smoke memory' } });
  await prisma.auditLog.create({ data: { actorUserId: user.id, action: 'tool.execute', spaceId: 'work' } });
  console.log('seed user data created');

  const svc = new PrivacyService(prisma);
  console.log('\n[导出]');
  const data = await svc.exportData(user.id);
  assert(data.user?.id === user.id, 'profile exported');
  assert(data.sessions.length === 1 && data.sessions[0].title === 'smoke', 'sessions exported');
  assert(data.lifeMemories.length === 1 && data.lifeMemories[0].content === 'smoke memory', 'life memories exported');
  assert(data.audits.length === 1, 'audit rows exported');

  console.log('\n[删除]');
  let denied = false;
  try { await svc.deleteAccount(user.id, 'NOPE'); } catch { denied = true; }
  assert(denied, 'delete requires confirm=DELETE');
  await svc.deleteAccount(user.id, 'DELETE');
  const gone = await prisma.user.findUnique({ where: { id: user.id } });
  assert(!gone, 'user row deleted');
  const sessions = await prisma.session.count({ where: { userId: user.id } });
  const memories = await prisma.lifeMemory.count({ where: { spaceId: lifeId } });
  const audits = await prisma.auditLog.count({ where: { actorUserId: user.id } });
  assert(sessions === 0, 'sessions cascade-deleted');
  assert(memories === 0, 'life memories cascade-deleted');
  assert(audits === 0, 'audit rows cascade-deleted');
  console.log('  ✓ smoke cleaned (life space removed by deleteAccount)');
  console.log('\nALL 7c SMOKE ASSERTIONS PASSED');
}
main().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
