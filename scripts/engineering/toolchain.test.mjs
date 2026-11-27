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
