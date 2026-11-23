import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 5188;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [resolve(webRoot, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
  cwd: webRoot,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk.toString(); });
server.stderr.on('data', chunk => { output += chunk.toString(); });

async function get(path) {
  const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
  return { response, body: await response.text() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log('PASS:', message);
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Next.js server exited before readiness');
    try {
      const response = await fetch(origin + '/', { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { ready = true; break; }
    } catch { /* wait for server */ }
    await delay(1000);
  }
  assert(ready, 'Next.js starts and serves homepage');

  for (const path of ['/', '/code']) {
    const { response, body } = await get(path);
    assert(response.status === 200, `${path} returns 200`);
    assert(response.headers.get('x-content-type-options') === 'nosniff', `${path} disables MIME sniffing`);
    assert(response.headers.get('x-frame-options') === 'DENY', `${path} prevents framing`);
    assert(response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', `${path} sets referrer policy`);
    assert(response.headers.get('cross-origin-opener-policy') === 'same-origin', `${path} isolates browsing context`);
    assert(body.includes('Ocean'), `${path} renders Ocean content`);
  }

  const code = await get('/code');
  assert(code.body.includes('pnpm --filter @ocean/cli dev'), 'Code page renders real CLI development command');
  assert(code.body.includes('Getting started'), 'Code page renders onboarding');
  const robots = await get('/robots.txt');
  assert(robots.response.status === 200, 'Robots metadata route is available');
  assert(robots.body.includes('Disallow: /app'), 'Robots exclude workspace');
  const missing = await get('/definitely-not-a-real-ocean-route');
  assert(missing.response.status === 404, 'Unknown route returns branded 404 status');
  console.log('Ocean website smoke checks passed.');
} catch (error) {
  console.error('Ocean website smoke checks failed:', error);
  console.error(output.slice(-4000));
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}
