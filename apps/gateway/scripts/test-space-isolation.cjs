/**
 * Phase 5 Space 隔离集成测试（真实 DB，自动清理）。
 * 运行：node scripts/test-space-isolation.cjs
 * 前置：postgres 已启动（docker ocean-postgres）、gateway 已 build（dist/ 存在）。
 * 验证：跨 Space 读写被拒、未知 Space 404、Run spaceType 以 Space 表为准、Life Space 幂等创建。
 */
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ocean?schema=public';
const pool = new Pool({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const dist = path.join(__dirname, '../dist/apps/gateway/src');
const { SpaceService } = require(path.join(dist, 'space/space.service.js'));
const { SessionService } = require(path.join(dist, 'session/session.service.js'));
const { RunService } = require(path.join(dist, 'run/run.service.js'));
const { SkillService } = require(path.join(dist, 'skill-registry/skill.service.js'));
const { MCPServerService } = require(path.join(dist, 'mcp-server/mcp-server.service.js'));
const { RAGService } = require(path.join(dist, 'rag/rag.service.js'));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

(async () => {
  const spaceService = new SpaceService(prisma);
  const sessionService = new SessionService(prisma, spaceService);
  const outboxMock = { enqueueRunRequested: async () => {}, enqueueToolRequested: async () => {} };
  const runService = new RunService(prisma, outboxMock, spaceService);
  const mcpService = new MCPServerService(prisma, { get: () => undefined }, spaceService);

  const user = await prisma.user.findFirst();
  const skill = await prisma.skill.findFirst();
  const outsider = await prisma.user.upsert({ where: { id: 'iso-outsider' }, update: {}, create: { id: 'iso-outsider', workId: 'iso-outsider' } });
  await prisma.space.upsert({ where: { id: 'iso-life' }, update: {}, create: { id: 'iso-life', slug: 'iso-life', name: '隔离测试 Life', type: 'life' } });

  let sess;
  let lifeMcp;
  let lifeDoc;

  try {
    // 1. Membership 门禁
    let denied = false;
    try { await spaceService.requireAccessibleSpace(outsider.id, 'work'); } catch (e) { denied = e.status === 403; }
    check('无 Membership 用户访问 work → 403', denied);

    // 2. Session 隔离
    sess = await sessionService.createSession(user.id, 'web', 'iso-session');
    check('Session 创建落库 work', sess.spaceId === 'work');
    let sessDenied = false;
    try { await sessionService.getSessions(outsider.id, 'work'); } catch (e) { sessDenied = e.status === 403; }
    check('outsider 列会话 → 403', sessDenied);

    // 3. MCP 跨 Space：业务查询读不到 life 记录、删不掉
    lifeMcp = await prisma.mCPServer.create({ data: { name: 'iso-life-mcp', transport: 'stdio', status: 'unknown', spaceId: 'iso-life' } });
    const viaBiz = await mcpService.getServerById(lifeMcp.id);
    check('跨 Space getServerById → null', viaBiz === null);
    let del404 = false;
    try { await mcpService.deleteServer(lifeMcp.id); } catch (e) { del404 = e.status === 404; }
    check('跨 Space deleteServer → 404', del404);

    // 4. Document 隔离：跨 Space 读不到、删不掉
    lifeDoc = await prisma.document.create({ data: { title: 'iso-life-doc', status: 'processing', spaceId: 'iso-life' } });
    const ragService = new RAGService(prisma, { get: () => undefined }, { mask: (x) => x });
    const docs = await ragService.getDocuments();
    check('跨 Space getDocuments 读不到 life 文档', !docs.some((d) => d.id === lifeDoc.id));
    let docDelFail = false;
    try { await ragService.deleteDocument(lifeDoc.id); } catch { docDelFail = true; }
    check('跨 Space deleteDocument 拒绝', docDelFail);

    // 5. Run：未知 Space 404；spaceType 以 Space 表为准；outsider 403
    let nf = false;
    try { await runService.create(user.id, { space: { id: 'nope', type: 'life' }, input: 'x', priority: 'interactive' }); }
    catch (e) { nf = e.status === 404; }
    check('未知 Space 创建 Run → 404', nf);
    const run = await runService.create(user.id, { space: { id: 'work', type: 'wrong-type' }, input: 'iso-run', priority: 'interactive' });
    check('Run spaceType 以 Space 表为准（请求传 wrong-type → work）', run.run.space.type === 'work');
    let runDenied = false;
    try { await runService.create(outsider.id, { space: { id: 'work', type: 'work' }, input: 'x', priority: 'interactive' }); }
    catch (e) { runDenied = e.status === 403; }
    check('outsider 创建 Run → 403', runDenied);

    // 6. Life Space 幂等创建 + 列表
    const life = await spaceService.ensureLifeSpace(user.id);
    check('Life Space 幂等创建（id=life-<userId>）', life.id === `life-${user.id}` && life.type === 'life');
    const second = await spaceService.ensureLifeSpace(user.id);
    check('Life Space 重复调用返回同一 id', second.id === life.id);
    const spaces = await spaceService.listSpaces(user.id);
    check('listSpaces 含 work + life', spaces.some((s) => s.id === 'work') && spaces.some((s) => s.id === life.id));

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    // cleanup（幂等）
    await prisma.agentRun.deleteMany({ where: { input: 'iso-run' } });
    await prisma.session.deleteMany({ where: { id: sess?.id } });
    await prisma.document.deleteMany({ where: { id: lifeDoc?.id } });
    await prisma.mCPServer.deleteMany({ where: { id: lifeMcp?.id } });
    await prisma.space.deleteMany({ where: { id: 'iso-life' } });
    await prisma.membership.deleteMany({ where: { spaceId: { startsWith: 'life-' } } });
    await prisma.space.deleteMany({ where: { id: { startsWith: 'life-' } } });
    await prisma.user.deleteMany({ where: { id: outsider.id } });
    await prisma.$disconnect();
    await pool.end();
    console.log('[cleanup] done');
  }
})();
