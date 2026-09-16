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
  const runService = new RunService(
    prisma,
    outboxMock,
    spaceService,
    { save: async () => ({ id: 'iso-art' }), load: async () => Buffer.from('iso') },
    { inc: () => {} },
  );
  const mcpService = new MCPServerService(prisma, { get: () => undefined }, spaceService);

  const user = await prisma.user.findFirst();
  const skill = await prisma.skill.findFirst();
  const outsider = await prisma.user.upsert({ where: { id: 'iso-outsider' }, update: {}, create: { id: 'iso-outsider', workId: 'iso-outsider' } });
  await prisma.space.upsert({ where: { id: 'iso-life' }, update: {}, create: { id: 'iso-life', slug: 'iso-life', name: '隔离测试 Life', type: 'life' } });

  let sess;
  let lifeMcp;
  let lifeDoc;
  let credMcp;

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

    // 2b. Session 返回 spaceId 字段 + 指定 Space 创建
    const sessList = await sessionService.getSessions(user.id, 'work');
    const sessWithSpace = sessList.find((x) => x.id === sess.id);
    check('getSessions 返回 spaceId 字段（work）', sessWithSpace?.spaceId === 'work');
    await prisma.membership.create({ data: { spaceId: 'iso-life', userId: user.id, role: 'owner' } });
    const lifeSess = await sessionService.createSession(user.id, 'web', 'iso-life-session', undefined, 'iso-life');
    check('createSession 指定 Space 落库', lifeSess.spaceId === 'iso-life');

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

    // 7. Run 附件 URL / 事件订阅：outsider 越权读取 → 403（归属校验）
    const isoRun = await runService.create(user.id, {
      space: { id: 'work', type: 'work' },
      input: 'iso-artifact-events',
      priority: 'interactive',
    });
    await runService.saveArtifact(isoRun.run.id, user.id, 'iso.txt', 'secret-content');
    let artDenied = false;
    try { await runService.getStatus(isoRun.run.id, outsider.id); } catch (e) { artDenied = e.status === 403; }
    check('附件 URL 越权：outsider getStatus → 403', artDenied);
    let evDenied = false;
    try { await runService.listEvents(isoRun.run.id, outsider.id, -1); } catch (e) { evDenied = e.status === 403; }
    check('事件订阅越权：outsider listEvents → 403', evDenied);

    // 8. 工具凭证：Space 级 MCP env（敏感 token）跨 Space 不透出 + 不可删
    credMcp = await prisma.mCPServer.create({
      data: {
        name: 'iso-cred-mcp',
        transport: 'stdio',
        status: 'unknown',
        spaceId: 'iso-life',
        env: { TOKEN: 'super-secret-token' },
      },
    });
    const credViaBiz = await mcpService.getServerById(credMcp.id);
    check('工具凭证越权：跨 Space 读不到 MCP env 配置', credViaBiz === null);
    let credDel = false;
    try { await mcpService.deleteServer(credMcp.id); } catch (e) { credDel = e.status === 404; }
    check('工具凭证越权：跨 Space 删除 → 404', credDel);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    // cleanup（幂等）
    await prisma.agentRun.deleteMany({ where: { input: 'iso-run' } });
    await prisma.agentRun.deleteMany({ where: { input: 'iso-artifact-events' } });
    await prisma.runArtifact.deleteMany({ where: { name: 'iso.txt' } });
    await prisma.mCPServer.deleteMany({ where: { id: credMcp?.id } });
    await prisma.session.deleteMany({ where: { id: sess?.id } });
    await prisma.session.deleteMany({ where: { title: 'iso-life-session' } });
    await prisma.document.deleteMany({ where: { id: lifeDoc?.id } });
    await prisma.mCPServer.deleteMany({ where: { id: lifeMcp?.id } });
    await prisma.membership.deleteMany({ where: { spaceId: 'iso-life' } });
    await prisma.space.deleteMany({ where: { id: 'iso-life' } });
    await prisma.lifeMemory.deleteMany({ where: { spaceId: { startsWith: 'life-' } } });
    await prisma.membership.deleteMany({ where: { spaceId: { startsWith: 'life-' } } });
    await prisma.space.deleteMany({ where: { id: { startsWith: 'life-' } } });
    await prisma.user.deleteMany({ where: { id: outsider.id } });
    await prisma.$disconnect();
    await pool.end();
    console.log('[cleanup] done');
  }
})();
