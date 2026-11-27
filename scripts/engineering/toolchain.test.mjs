import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runTool, jsonResult } from './toolchain.mjs';

const root = fileURLToPath(new URL('../../',import.meta.url));
function fixture(t, files) {
  // The CLI binaries are supplied by the actual locked root installation.
  // Place fixtures below root so pnpm exec finds those binaries.
  const dir = mkdtempSync(path.join(root,'.engineering-fixture-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  for (const [file,content] of Object.entries(files)) {
    const name = path.join(dir,file);
    mkdirSync(path.dirname(name),{recursive:true});
    writeFileSync(name,content);
  }
  return dir;
}
test('architecture tool rejects a real core-to-host import and accepts an internal edge',t => {
  const dir = fixture(t,{
    'packages/shared/core/src/main.ts':'import { host } from "../../../../apps/web/src/host"; export const value = host;',
    'packages/shared/core/src/local.ts':'export const local = 1;',
    'apps/web/src/host.ts':'export const host = 1;',
    'tsconfig.json':'{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"}}'
  });
  copyFileSync(path.join(root,'.dependency-cruiser.cjs'),path.join(dir,'.dependency-cruiser.cjs'));
  const args=['depcruise','--config','.dependency-cruiser.cjs','--ts-config','tsconfig.json','--output-type','json','packages/shared/core/src'];
  const bad=runTool(args,dir);
  assert.equal(bad.status,1,bad.stderr);
  assert.ok(jsonResult(bad,'fixture',[1]).summary.violations.some(v=>v.rule.name==='core-cannot-import-host'));
  writeFileSync(path.join(dir,'packages/shared/core/src/main.ts'),'import { local } from "./local"; export const value = local;');
  const good=runTool(args,dir);
  assert.equal(good.status,0,good.stderr);
  assert.equal(jsonResult(good,'fixture').summary.violations.length,0);
});
test('report parsing does not swallow execution or format errors',()=>{
  assert.throws(()=>jsonResult({status:2,stdout:'{}',stderr:'error'},'test'),/failed/);
  assert.throws(()=>jsonResult({status:0,stdout:'not json',stderr:''},'test'),/did not emit JSON/);
});

test('Knip finds an unreachable file but preserves a live imported file',t => {
  const dir = fixture(t,{
    'package.json':'{"name":"knip-fixture","private":true,"type":"module"}',
    'knip.json':'{"entry":["src/index.ts"],"project":["src/**/*.ts"]}',
    'src/index.ts':'import { live } from "./live"; console.log(live);',
    'src/live.ts':'export const live = 1;',
    'src/dead.ts':'export const dead = 2;'
  });
  // Explicit directory avoids accidental monorepo discovery.
  const result = runTool(['knip','--directory',dir,'--reporter','json','--no-exit-code'],root);
  const report = jsonResult(result,'knip-fixture');
  assert.ok(Array.isArray(report.issues));
  const unused = report.issues.filter(i => i.files?.length).map(i => i.file);
  assert.ok(unused.some(p => p.endsWith('src/dead.ts')),JSON.stringify(report));
  assert.ok(!unused.some(p => p.endsWith('src/live.ts')));
});
test('jscpd detects actual duplicate fragments and emits locations',t => {
  const fragment = [
    'export function calculate(input) {',
    '  const result = [];',
    '  for (const item of input) {',
    '    if (item.enabled && item.count > 0) {',
    '      const amount = item.count * item.price;',
    '      result.push({ name: item.name, amount: amount });',
    '    }',
    '  }',
    '  return result.reduce((sum, item) => sum + item.amount, 0);',
    '}'
  ].join('\n');
  const dir = fixture(t,{'src/a.js':fragment,'src/b.js':fragment});
  const output=path.join(dir,'report');
  const result=runTool(['jscpd',path.join(dir,'src'),'--no-gitignore','--min-tokens','20','--min-lines','5','--reporters','json','--output',output],root);
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(readFileSync(path.join(output,'jscpd-report.json'),'utf8'));
  assert.ok(report.duplicates.some(d => [d.firstFile.name,d.secondFile.name].some(p => p.endsWith('a.js')) && [d.firstFile.name,d.secondFile.name].some(p => p.endsWith('b.js'))));
});
