/* 6f 真实 DB 冒烟：Grant 管理 + Artifact 事件闭环。需先 build（读 dist）。 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ocean?schema=public';
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

const { SpaceService } = require('../dist/apps/gateway/src/space/space.service');
const { RunService } = require('../dist/apps/gateway/src/run/run.service');
const { ArtifactStore } = require('../dist/apps/gateway/src/artifact/artifact.store');

const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-art-'));
const store = new ArtifactStore(prisma, tmpRoot);
const space = new SpaceService(prisma);

async function main() {
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg); console.log('  ✓ ' + msg); };

  // 用 seed 用户（真实 membership）
  const user = await prisma.user.findFirst({ where: { memberships: { some: {} } }, select: { id: true } });
  const other = await prisma.user.findFirst({ where: { id: { not: user.id } }, select: { id: true } });
  assert(user && other, 'seed users exist');

  console.log('\n[Grant 管理]');
  // 缺省 fromSpace → 本人 Life
  const g = await space.createGrant(user.id, { toSpaceId: 'work', purpose: 'smoke-6f' });
  assert(g.fromSpaceId === `life-${user.id}`, `default fromSpace=life-${user.id} (got ${g.fromSpaceId})`);
  // 幂等复用
  const g2 = await space.createGrant(user.id, { toSpaceId: 'work', purpose: 'smoke-6f-2' });
  assert(g2.id === g.id, 'idempotent reuse same grant id');
  // 列表可见
  const list = await space.listGrants(user.id);
  assert(list.some((x) => x.id === g.id), 'grant visible in list');
  // 非成员空间不可作为 fromSpace（越权）：other 无权操作 life-user 空间
  let denied = false;
  try { await space.createGrant(other.id, { fromSpaceId: `life-${user.id}`, toSpaceId: 'work' }); } catch { denied = true; }
  assert(denied, 'cross-space fromSpace denied for non-member');
  // 撤销
  await space.revokeGrant(user.id, g.id);
  const after = await space.listGrants(user.id);
  assert(!after.some((x) => x.id === g.id), 'revoked grant hidden from list');

  console.log('\n[Artifact 事件闭环]');
  const runService = new RunService(prisma, { enqueueRunRequested: async () => {}, enqueueToolRequested: async () => {} }, space, store);
  // 直接构造一个真实 run
  const run = await prisma.agentRun.create({
    data: { status: 'succeeded', userId: user.id, spaceId: 'work', spaceType: 'work', input: '{}' },
  });
  const rec = await runService.saveArtifact(run.id, user.id, 'smoke.md', '# smoke artifact\nhello 6f');
  assert(rec.name === 'smoke.md', 'artifact saved');
  // 事件已追加
  const ev = await prisma.runEvent.findFirst({ where: { runId: run.id, type: 'artifact.created' }, orderBy: { sequence: 'desc' } });
  assert(!!ev, 'artifact.created event appended');
  const payload = ev.payload;
  assert(payload.artifact && payload.artifact.uri.includes(rec.id), 'event payload has artifact uri');
  // 内容可读回
  const content = await store.load(run.id, rec.id);
  assert(content.includes('hello 6f'), 'artifact content loadable');
  // 越权读：other 用户不能 save 到 user 的 run
  let denied2 = false;
  try { await runService.saveArtifact(run.id, other.id, 'x.txt', 'x'); } catch { denied2 = true; }
  assert(denied2, 'cross-user saveArtifact denied');
  // 清理 smoke 数据
  await prisma.runEvent.deleteMany({ where: { runId: run.id } });
  await prisma.runArtifact.deleteMany({ where: { runId: run.id } });
  await prisma.agentRun.delete({ where: { id: run.id } });
  await prisma.contextGrant.deleteMany({ where: { purpose: { startsWith: 'smoke-6f' } } });
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log('  ✓ smoke data cleaned');
  console.log('\nALL 6f SMOKE ASSERTIONS PASSED');
}

main()
  .catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
