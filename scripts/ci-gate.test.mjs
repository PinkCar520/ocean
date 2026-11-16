import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('both image publishing jobs require the same reusable quality gate', () => {
 const deploy = read('.github/workflows/deploy.yml');
 assert.match(deploy, /quality:\s*\n\s+uses: \.\/\.github\/workflows\/ci.yml/);
 for (const name of ['build-and-push-gateway', 'build-and-push-web']) {
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
