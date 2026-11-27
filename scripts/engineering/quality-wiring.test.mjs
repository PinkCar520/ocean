import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('shared quality workflow invokes all engineering checks as reusable jobs',()=>{
 const ci=read('.github/workflows/ci.yml');
 assert.match(ci,/workflow_call:/);
 for(const n of ['analysis','codemod','verification']){
  assert.ok(ci.includes('uses: ./.github/workflows/engineering-'+n+'.yml'));
  const wf=read('.github/workflows/engineering-'+n+'.yml');
  assert.match(wf,/on:\s*\n\s+workflow_call:/);
  assert.doesNotMatch(wf,/continue-on-error|passWithNoTests|\|\| true/);
 }
 assert.ok(ci.includes('pnpm run audit:governance'));
 assert.ok(ci.includes('pnpm run audit:source'));
 const deploy=read('.github/workflows/deploy.yml');
 assert.match(deploy,/quality:\s*\n\s+uses: \.\/\.github\/workflows\/ci.yml/);
});
test('scheduled maintenance is read-only and reuses analysis workflow',()=>{
 const wf=read('.github/workflows/engineering-maintenance.yml');
 assert.match(wf,/schedule:/);
 assert.match(wf,/contents: read/);
 assert.match(wf,/uses: \.\/\.github\/workflows\/engineering-analysis.yml/);
 assert.doesNotMatch(wf,/contents: write|git push|gh pr create/);
});
