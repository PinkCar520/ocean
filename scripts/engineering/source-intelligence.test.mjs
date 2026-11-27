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
