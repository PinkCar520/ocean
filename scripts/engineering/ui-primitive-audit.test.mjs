import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {auditUi,discoverPairs} from './ui-primitive-audit.mjs';
test('compares emitted AST and types, normalizes resolved imports, preserves real style changes',t=>{
 const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'ocean-ui-audit-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const files={
  'packages/ui/tsconfig.json':'{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","strict":true},"include":["src"]}',
  'packages/ui/src/lib/utils.ts':'export const value = 1;',
  'packages/ui/src/components/match.ts':'import {value} from "../lib/utils"; export const primitive=(x:number)=>value+x;',
  'packages/ui/src/components/ui/match.ts':"import { value } from '../../lib/utils';\nexport const primitive = (x: number) => value + x;",
  'packages/ui/src/components/different.ts':'export const primitive=(x:string)=>"z-50"+x;',
  'packages/ui/src/components/ui/different.ts':'export const primitive=(x:string)=>"z-[10000]"+x;',
  'packages/ui/src/components/other.ts':'export const primitive=0;'
 };
 for(const [name,content] of Object.entries(files)){const absolute=path.join(root,name);mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,content)}
 const tracked=Object.keys(files),report={revision:null,files:tracked.map(p=>({path:p,sha256:createHash('sha256').update(files[p]).digest('hex')})),edges:[],unknownDynamicReferences:[],entryPoints:[],symbolUsages:[]};
 assert.equal(discoverPairs(tracked).length,2);
 const result=auditUi(root,tracked,report);
 assert.equal(result.summary.structuralMatchCandidates,1);
 const matched=result.records.find(r=>r.left.endsWith('/match.ts'));
 assert.equal(matched.runtimeAstMatch,true);assert.equal(matched.apiMatch,true);
 const changed=result.records.find(r=>r.left.endsWith('/different.ts'));
 assert.equal(changed.runtimeAstMatch,false);assert.deepEqual(changed.literalDifferences,{leftOnly:['z-50'],rightOnly:['z-[10000]']});
 report.files[0].sha256='stale';
 const original=report.files.find(x=>x.path===matched.left);original.sha256='stale';
 assert.throws(()=>auditUi(root,tracked,report),/missing or stale/);
});

test('does not count pure symbol-identical reexports as duplicate implementations',t=>{
 const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'ocean-ui-alias-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const files={
  'packages/ui/tsconfig.json':'{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","strict":true},"include":["src"]}',
  'packages/ui/src/components/button.ts':'export { Button } from "./ui/button"; export type { Props } from "./ui/button";',
  'packages/ui/src/components/ui/button.ts':'export const Button = (p: Props) => p.label; export interface Props {label:string;}',
  'packages/ui/src/components/input.ts':'export { Input } from "./ui/input"; console.log("side effect");',
  'packages/ui/src/components/ui/input.ts':'export const Input = () => "input";'
 };
 for(const [name,content] of Object.entries(files)){const absolute=path.join(root,name);mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,content)}
 const tracked=Object.keys(files),report={revision:null,files:tracked.map(p=>({path:p,sha256:createHash('sha256').update(files[p]).digest('hex')})),edges:[],unknownDynamicReferences:[],entryPoints:[],symbolUsages:[]};
 const result=auditUi(root,tracked,report);
 assert.equal(result.summary.compatibilityReexports,1);
 assert.equal(result.records.find(r=>r.left.endsWith('/button.ts')).classification,'compatibility-reexport');
 assert.equal(result.records.find(r=>r.left.endsWith('/input.ts')).classification,'differences-or-unproven');
});
