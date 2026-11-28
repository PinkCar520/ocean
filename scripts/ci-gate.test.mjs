import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('all image publishing jobs require the same reusable quality gate', () => {
 const deploy = read('.github/workflows/deploy.yml');
 assert.match(deploy, /quality:\s*\n\s+uses: \.\/\.github\/workflows\/ci.yml/);
 for (const name of ['build-and-push-gateway', 'build-and-push-web', 'build-and-push-inference', 'mirror-upstream']) {
  const job = deploy.split(`  ${name}:`)[1].split(/\n  [\w-]+:/)[0];
  assert.match(job, /needs: \[prep, quality\]/);
  assert.doesNotMatch(job, /continue-on-error|always\(\)/);
 }
});
test('quality checks include types, unit tests, HTTP and fault regressions without bypass', () => {
 const ci = read('.github/workflows/ci.yml');
 for (const command of ['ci:typecheck', 'ci:unit', 'ci:e2e', 'ci:faults']) assert.ok(ci.includes(`pnpm run ${command}`));
 assert.match(ci, /--frozen-lockfile/);
 assert.doesNotMatch(ci, /continue-on-error|passWithNoTests|\|\| true/);
});

test('TCR publication is main-only, quality-gated and does not run on a production host', () => {
 const deploy = read('.github/workflows/deploy.yml');
 assert.doesNotMatch(deploy, /runs-on: self-hosted|DOCKERHUB_|type=raw,value=latest|pull_request_target/);
 assert.match(deploy, /push:\s*\n\s+branches:\s*\n\s+- main\s*\n\s+workflow_dispatch:/);
 for (const name of ['build-and-push-gateway', 'build-and-push-web', 'build-and-push-inference', 'mirror-upstream']) {
  const job = deploy.split(`  ${name}:`)[1].split(/\n  [\w-]+:/)[0];
  assert.match(job, /environment: production/);
  assert.match(job, /registry: ccr\.ccs\.tencentyun\.com/);
  assert.match(job, /secrets\.TCR_USERNAME/);
  assert.match(job, /secrets\.TCR_PASSWORD/);
 }
 assert.match(deploy, /verify-publication:[\s\S]*needs: \[prep, build-and-push-gateway, build-and-push-web, build-and-push-inference, mirror-upstream\]/);
 assert.match(deploy, /docker buildx imagetools inspect "\$image@\$digest"/);
 assert.match(deploy, /ocean-release\.json/);
});

test('upstream TCR mirroring uses a standalone shell-checked script', () => {
 const deploy = read('.github/workflows/deploy.yml');
 const ci = read('.github/workflows/ci.yml');
 const script = read('scripts/mirror-tcr-upstream-images.sh');
 assert.ok(deploy.includes('run: bash scripts/mirror-tcr-upstream-images.sh'));
 assert.ok(ci.includes("find apps scripts -type f -name '*.sh' -print0 | xargs -0 -r -n1 bash -n"));
 assert.ok(script.includes('for service in postgres redis; do'));
 assert.ok(script.includes('\ndone\n'));
 assert.ok(script.includes('docker buildx imagetools create'));
 assert.ok(script.includes('if [[ "$actual_digest" != "$expected_digest" ]]'));
 const mirrorJob = deploy.slice(deploy.indexOf('  mirror-upstream:'), deploy.indexOf('  verify-publication:'));
 assert.ok(mirrorJob.includes('uses: actions/checkout@v6'));
});
