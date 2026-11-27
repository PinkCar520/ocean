import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transform,plan,apply } from './codemod.mjs';
const file='apps/web/src/main.ts';
const config='apps/web/tsconfig.json';
function fixture(t){
 const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'ocean-codemod-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const source='// import "./target"\nconst text = "./target";\nimport { x } from "./target";\nexport { x } from "./target";\nconst lazy = () => import("./target");\n';
 const files={
  [config]:'{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","paths":{"@target":["./src/target.ts"],"@other":["./src/other.ts"]}},"include":["src"]}',
  [file]:source,
  'apps/web/src/target.ts':'export const x=1;',
  'apps/web/src/other.ts':'export const x=2;'
 };
 for(const [name,body] of Object.entries(files)){const dest=path.join(root,name);mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,body)}
 const tracked=Object.keys(files),rule={file,from:'./target',to:'@target',configs:[config]};
 return {root,tracked,rule,source};
}
test('AST rewrite preserves ordinary strings, comments and shadowable require calls',()=>{
 const input='// "./target"\nconst value="./target";\nimport "./target";\nexport * from "./target";\nconst lazy=import("./target");\nrequire("./target");';
 const result=transform(input,'a.ts','./target','@target');
 assert.equal(result.edits.length,3);
 assert.match(result.result,/const value="\.\/target"/);
 assert.match(result.result,/require\("\.\/target"\)/);
 assert.match(result.result,/import\("@target"\)/);
});
test('preview does not modify source; apply validates module identity and hashes',t=>{
 const {root,tracked,rule,source}=fixture(t);
 const p=plan(root,tracked,[rule],'abc');
 assert.equal(p.changes[0].rules[0].count,3);
 assert.equal(readFileSync(path.join(root,file),'utf8'),source);
 const result=apply(root,tracked,p,'abc');
 assert.equal(result.length,1);
 assert.match(readFileSync(path.join(root,file),'utf8'),/import \{ x \} from "@target"/);
 assert.throws(()=>apply(root,tracked,p,'abc'),/No matching|drift/);
});
test('different targets, unresolved aliases, modified plans and changed source are rejected',t=>{
 const {root,tracked,rule,source}=fixture(t);
 assert.throws(()=>plan(root,tracked,[{...rule,to:'@other'}]),/identity/);
 assert.throws(()=>plan(root,tracked,[{...rule,to:'@missing'}]),/identity/);
 const p=plan(root,tracked,[rule],'abc');
 const tampered=structuredClone(p);tampered.changes[0].result='malicious';
 assert.throws(()=>apply(root,tracked,tampered,'abc'),/drift/);
 assert.throws(()=>apply(root,tracked,p,'def'),/stale/);
 writeFileSync(path.join(root,file),source+'// edited\n');
 assert.throws(()=>apply(root,tracked,p,'abc'),/drift/);
 assert.equal(readFileSync(path.join(root,file),'utf8'),source+'// edited\n');
});
