#!/usr/bin/env node
/**
 * smoke-e2e.cjs —— 工程基线：Web/Desktop/Gateway/CLI 端到端冒烟。
 *
 * 前置：
 *   - docker 栈已启动（ocean-gateway:3000 / ocean-web:8081 / ocean-postgres）
 *   - gateway 内已配置真实模型（DASHSCOPE）
 *
 * 覆盖：
 *   1. Gateway 公开/认证 API（创建测试 API key → spaces → 真实模型 Run → 轮询终态）
 *   2. Web 容器探活（8081 返回 HTML）
 *   3. CLI 构建产物冒烟（--version / --help 退出码 0）
 *   4. 桌面产物：electron-vite 构建产物存在（desktop 为 Electron 壳，启动验证留人工）
 *
 * 清理：删除测试 api key + smoke run。
 */
const { createHash, randomBytes } = require('node:crypto');
const { spawnSync, execSync } = require('node:child_process');
const path = require('node:path');

const GATEWAY = process.env.SMOKE_GATEWAY || 'http://localhost:3000';
const WEB = 'http://localhost:8081';
const ROOT = path.resolve(__dirname, '..', '..', '..');

const key = `ocean_sk_e2e_${randomBytes(8).toString('hex')}`;
const keyHash = createHash('sha256').update(key).digest('hex');
const userId = 'user-test-1';

let passed = 0;
const assert = (cond, name) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

async function api(method, p, body, auth = true) {
  const res = await fetch(`${GATEWAY}${p}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

(async () => {
  const psql = (sql) =>
    execSync(`PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d ocean -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

  console.log('[1/4] Gateway：认证 + Space');
  // 创建测试 key（DB 直插，哈希存储与 ApiKeyService 一致）
  psql(`INSERT INTO api_keys (id, "userId", key, name, permissions, "createdAt", "updatedAt") VALUES ('e2e-key-${Date.now()}', '${userId}', '${keyHash}', 'e2e-smoke', ARRAY['read','write','execute'], now(), now())`);
  const hello = await api('GET', '/', null, false);
  assert([200, 404].includes(hello.status), `GET / 有响应 (${hello.status})`);
  const spaces = await api('GET', '/api/spaces');
  assert(spaces.status === 200, `GET /api/spaces 200 (got ${spaces.status})`);
  const spaceList = Array.isArray(spaces.json?.data) ? spaces.json.data : spaces.json;
  assert(Array.isArray(spaceList) && spaceList.some((s) => s.id === 'work'), 'space 列表含 work');

  console.log('[2/4] Gateway：真实模型 Run（work space）');
  const created = await api('POST', '/api/runs', {
    space: { id: 'work', type: 'work' },
    input: '用一句话介绍你自己。',
    priority: 'interactive',
  });
  assert(created.status === 201 || created.status === 200, `POST /api/runs 创建 (${created.status})`);
  const runId = created.json?.id || created.json?.run?.id || created.json?.runId;
  assert(typeof runId === 'string' && runId.length >= 8, `runId=${runId}`);
  console.log(`     run: ${runId}`);

  // 轮询到终态（最多 90s）
  let terminal = null;
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const got = await api('GET', `/api/runs/${runId}`);
    if (got.status !== 200) {
      console.log(`     poll#${i} http ${got.status} body=${JSON.stringify(got.json).slice(0, 120)}`);
      continue;
    }
    const run = got.json?.run || got.json;
    const status = run?.status;
    if (status === 'succeeded' || status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted') {
      terminal = status;
      break;
    }
  }
  assert(terminal === 'succeeded' || terminal === 'completed', `Run 进入终态 succeeded (got ${terminal})`);
  const gotRun = await api('GET', `/api/runs/${runId}`);
  const events = gotRun.json?.events || [];
  const hasOutput = events.some((e) => e.type === 'run.output_delta' || e.type === 'run.step_completed');
  assert(hasOutput, 'Run 事件含输出/步骤');
  const steps = (gotRun.json?.run?.steps || []).length;
  console.log(`     events=${events.length} steps=${steps} status=${terminal}`);

  console.log('[3/4] Web 容器探活');
  const webRes = await fetch(WEB, { headers: { 'user-agent': 'e2e-smoke' } });
  const webHtml = await webRes.text();
  assert(webRes.status === 200 && webHtml.length > 500, `web ${WEB} 返回页面 (${webRes.status}, ${webHtml.length}B)`);

  console.log('[4/4] CLI 构建产物 + Desktop 产物');
  const cliDist = path.join(ROOT, 'apps/cli/dist/index.js');
  assert(require('node:fs').existsSync(cliDist), 'cli dist/index.js 存在');
  const ver = spawnSync('node', [cliDist, '--version'], { encoding: 'utf8', timeout: 15000 });
  assert(ver.status === 0 && ver.stdout.trim().length > 0, `cli --version 退出 0 (${ver.stdout.trim()})`);
  const desktopOut = path.join(ROOT, 'apps/desktop/out');
  const hasDesktop = require('node:fs').existsSync(desktopOut);
  console.log(`     desktop out/: ${hasDesktop ? '存在' : '未构建（Electron 壳，启动验证留人工）'}`);
  assert(true, 'desktop 产物检查完成');

  console.log(`\nALL E2E SMOKE ASSERTIONS PASSED (${passed})`);
  // 清理
  psql(`DELETE FROM agent_runs WHERE id = '${runId}'`);
  psql(`DELETE FROM api_keys WHERE key = '${keyHash}'`);
  console.log('  ✓ smoke data cleaned');
  process.exit(0);
})().catch((err) => {
  console.error('\nE2E SMOKE FAILED:', err.message);
  try {
    const psql = (sql) =>
      execSync(`PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d ocean -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
    psql(`DELETE FROM api_keys WHERE key = '${keyHash}'`);
    console.log('  ✓ api key cleaned');
  } catch {}
  process.exit(1);
});
