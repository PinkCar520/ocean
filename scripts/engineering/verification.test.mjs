import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMatrix,orderedWorkspaces} from './verification.mjs';
const manifests=[{name:'ui',scripts:{typecheck:'tsc',test:'vitest'}},{name:'skills'}];
const matrix={schemaVersion:1,workspaces:[{name:'ui',checks:[['typecheck'],['test']],external:[],gaps:[]},{name:'skills',checks:[],external:[],gaps:['data-only']}]};
test('accounts for every workspace and declared verification script',()=>assert.doesNotThrow(()=>validateMatrix(manifests,matrix)));
test('rejects missing workspaces, missing scripts and invented checks',()=>{
 const a=structuredClone(matrix);a.workspaces.pop();assert.throws(()=>validateMatrix(manifests,a),/missing from matrix/);
 const b=structuredClone(matrix);b.workspaces[0].checks.pop();assert.throws(()=>validateMatrix(manifests,b),/Uncovered script/);
 const c=structuredClone(matrix);c.workspaces[0].checks.push(['build']);assert.throws(()=>validateMatrix(manifests,c),/Missing workspace command/);
});

test('nested typecheck is only covered if the executed script actually calls it',()=>{
 const manifests=[{name:'desktop',scripts:{build:'pnpm run typecheck && electron-vite build',typecheck:'tsc'}}];
 const matrix={schemaVersion:1,workspaces:[{name:'desktop',checks:[['build']],external:[],indirect:[{script:'typecheck',via:'build'}],gaps:[]}]};
 assert.doesNotThrow(()=>validateMatrix(manifests,matrix));
 manifests[0].scripts.build='electron-vite build';
 assert.throws(()=>validateMatrix(manifests,matrix),/Unproven indirect coverage/);
});

test('builds dependency workspaces before consumers regardless of matrix order',()=>{
 const manifests=[{name:'sandbox',scripts:{build:'tsc'},dependencies:{core:'workspace:*'}},{name:'core',scripts:{build:'tsc'},dependencies:{contracts:'workspace:*'}},{name:'contracts',scripts:{build:'tsc'}}];
 const matrix={schemaVersion:1,workspaces:manifests.map(m=>({name:m.name,checks:[['build']],external:[],gaps:[]}))};
 assert.deepEqual(orderedWorkspaces(manifests,matrix).map(m=>m.name),['contracts','core','sandbox']);
 manifests[2].dependencies={sandbox:'workspace:*'};
 assert.throws(()=>orderedWorkspaces(manifests,matrix),/Cyclic workspace build dependency/);
 manifests[2].dependencies={missing:'workspace:*'};
 assert.throws(()=>orderedWorkspaces(manifests,matrix),/Unresolved workspace dependency/);
});
