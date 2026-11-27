import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze } from './source-intelligence.mjs';

test('compiler-backed inventory resolves aliases, reexports, type imports and cross-workspace references', t => {
  const root = mkdtempSync(path.join(os.tmpdir(),'ocean-source-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const fixture = {
    'packages/ui/package.json': '{"name":"@ocean/ui"}',
    'apps/web/package.json': '{"name":"web"}',
    'packages/ui/tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"},"include":["src"]}',
    'apps/web/tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","paths":{"@ocean/ui/*":["../../packages/ui/src/*"]}},"include":["src"]}',
    'packages/ui/src/button.ts': 'export function Button() {}\nexport interface Props { enabled: boolean }',
    'packages/ui/src/index.ts': 'export { Button as Primary } from "./button";',
    'apps/web/src/main.ts': 'import { Button as B } from "@ocean/ui/button";\nimport type { Props } from "@ocean/ui/button";\nexport const run = () => B();\nexport const lazy = () => import("@ocean/ui/button");\nexport const runtime = (s: string) => import(s);\nimport "./missing";',
    'restored-src/example.ts': 'export const ignored = true;',
    'packages/ui/src/untracked.ts': 'export const ignored = true;'
  };
  for (const [name,content] of Object.entries(fixture)) {
    const file = path.join(root,name); mkdirSync(path.dirname(file),{recursive:true}); writeFileSync(file,content);
  }
  const tracked = Object.keys(fixture).filter(p => !p.includes('untracked'));
  const result = analyze(root,tracked);
  assert.equal(result.coverage.expected,3);
  assert.equal(result.coverage.analyzed,3);
  assert.deepEqual(result.coverage.missing,[]);
  assert.equal(result.scope.excludedTrackedSourceCount,1);
  const button = result.files.find(f => f.path.endsWith('/button.ts'));
  assert.deepEqual(button.exports.map(e => [e.name,e.type,e.value]),[['Button',false,true],['Props',true,false]]);
  assert.deepEqual(result.files.find(f => f.path.endsWith('/index.ts')).exports[0].declarations,['packages/ui/src/button.ts']);
  const linked = result.edges.filter(e => e.from === 'apps/web/src/main.ts' && e.status === 'source');
  assert.equal(linked.length,3);
  assert.ok(linked.some(e => e.typeOnly && e.names.includes('Props')));
  assert.ok(linked.some(e => e.kind === 'dynamic-import'));
  assert.ok(result.edges.some(e => e.specifier === './missing' && e.status === 'unresolved'));
  assert.equal(result.unknownDynamicReferences[0].expression,'s');
  assert.deepEqual(analyze(root,[...tracked].reverse()),result);
});

test('missing tracked files are explicitly reported', t => {
  const root = mkdtempSync(path.join(os.tmpdir(),'ocean-source-missing-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const result = analyze(root,['packages/ui/src/missing.ts']);
  assert.equal(result.coverage.expected,1);
  assert.equal(result.coverage.analyzed,0);
  assert.deepEqual(result.coverage.missing,['packages/ui/src/missing.ts']);
});

test('keeps overlapping compiler contexts and semantic cross-file bindings', t => {
  const root = mkdtempSync(path.join(os.tmpdir(),'ocean-source-contexts-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const fixture = {
    'apps/web/tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","paths":{"@impl":["./a.ts"]}},"include":["*.ts"]}',
    'apps/web/tsconfig.alt.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","paths":{"@impl":["./b.ts"]}},"include":["*.ts"]}',
    'apps/web/a.ts': 'export function implementation() { return 1 }',
    'apps/web/b.ts': 'export function implementation() { return 2 }',
    'apps/web/main.ts': 'import { implementation as run } from "@impl";\nexport const result = run();'
  };
  for (const [name,content] of Object.entries(fixture)) {
    const file = path.join(root,name); mkdirSync(path.dirname(file),{recursive:true}); writeFileSync(file,content);
  }
  const report = analyze(root,Object.keys(fixture));
  assert.equal(report.coverage.analyzed,3);
  const main = report.files.find(f => f.path.endsWith('/main.ts'));
  assert.equal(main.contexts.length,2);
  assert.deepEqual(report.edges.map(e => e.target).sort(),['apps/web/a.ts','apps/web/b.ts']);
  const calls = report.symbolUsages.filter(u => u.from === main.path && u.line === 2 && u.name === 'run');
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(u => u.declarations[0].file).sort(),['apps/web/a.ts','apps/web/b.ts']);
  assert.deepEqual(analyze(root,Object.keys(fixture).reverse()),report);
});

test('maps unbuilt workspace exports without claiming compiler resolution or ignoring export restrictions', t => {
  const root = mkdtempSync(path.join(os.tmpdir(),'ocean-source-exports-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const fixture = {
    'packages/contracts/package.json': '{"name":"@ocean/contracts","exports":{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"},"./features/*":"./dist/features/*.js"}}',
    'packages/contracts/tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","rootDir":"src","outDir":"dist"},"include":["src"]}',
    'packages/contracts/src/index.ts': 'export const value = 1;',
    'packages/contracts/src/features/demo.ts': 'export const demo = 2;',
    'packages/contracts/src/private.ts': 'export const secret = 3;',
    'apps/web/main.ts': 'import "@ocean/contracts";\nimport "@ocean/contracts/features/demo";\nimport "@ocean/contracts/private";'
  };
  for (const [name,content] of Object.entries(fixture)) {
    const file = path.join(root,name); mkdirSync(path.dirname(file),{recursive:true}); writeFileSync(file,content);
  }
  const report = analyze(root,Object.keys(fixture));
  const [entry,feature,hidden] = report.edges;
  assert.equal(entry.status,'projected-source');
  assert.equal(entry.target,null);
  assert.deepEqual(entry.sourceCandidates,['packages/contracts/src/index.ts']);
  assert.deepEqual(feature.sourceCandidates,['packages/contracts/src/features/demo.ts']);
  assert.equal(hidden.status,'unresolved');
  assert.deepEqual(hidden.sourceCandidates,[]);
  assert.equal(report.entryPoints.filter(e => e.status === 'mapped').length,2);
  assert.equal(report.entryPoints.filter(e => e.status === 'pattern').length,1);
});

test('inventories framework and declared runtime roots without asserting unsupported languages are analyzed', t => {
  const root = mkdtempSync(path.join(os.tmpdir(),'ocean-source-runtime-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const fixture = {
    'apps/web/package.json': '{"name":"web","dependencies":{"next":"1"}}',
    'apps/web/src/app/page.tsx': 'export default function Page() { return null; }',
    'apps/web/src/app/helper.ts': 'export const helpers = import.meta.glob("./*.tsx");',
    'apps/desktop/index.html': '<html></html>',
    'apps/desktop/src/renderer.ts': 'export const x = 1;',
    'products/olo/App.swift': 'import SwiftUI'
  };
  for (const [name,content] of Object.entries(fixture)) {
    const file = path.join(root,name); mkdirSync(path.dirname(file),{recursive:true}); writeFileSync(file,content);
  }
  const config = {entries:[{path:'apps/desktop/src/renderer.ts',kind:'renderer',evidence:'apps/desktop/index.html'},{path:'apps/desktop/missing.ts',kind:'main',evidence:'apps/desktop/index.html'}]};
  const report = analyze(root,Object.keys(fixture),null,config);
  assert.ok(report.runtimeEntries.some(e => e.path.endsWith('/page.tsx') && e.status === 'convention-candidate'));
  assert.ok(report.runtimeEntries.some(e => e.kind === 'renderer' && e.status === 'declared'));
  assert.equal(report.runtimeDiagnostics.length,1);
  assert.ok(report.unknownDynamicReferences.some(e => e.kind === 'import-meta-glob'));
  assert.ok(report.unanalysedSources.some(e => e.path === 'products/olo/App.swift'));
  assert.match(report.files[0].sha256,/^[a-f0-9]{64}$/);
});
