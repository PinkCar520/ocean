import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMatrix} from './verification.mjs';
const manifests=[{name:'ui',scripts:{typecheck:'tsc',test:'vitest'}},{name:'skills'}];
const matrix={schemaVersion:1,workspaces:[{name:'ui',checks:[['typecheck'],['test']],external:[],gaps:[]},{name:'skills',checks:[],external:[],gaps:['data-only']}]};
test('accounts for every workspace and declared verification script',()=>assert.doesNotThrow(()=>validateMatrix(manifests,matrix)));
test('rejects missing workspaces, missing scripts and invented checks',()=>{
 const a=structuredClone(matrix);a.workspaces.pop();assert.throws(()=>validateMatrix(manifests,a),/missing from matrix/);
 const b=structuredClone(matrix);b.workspaces[0].checks.pop();assert.throws(()=>validateMatrix(manifests,b),/Uncovered script/);
 const c=structuredClone(matrix);c.workspaces[0].checks.push(['build']);assert.throws(()=>validateMatrix(manifests,c),/Missing workspace command/);
});
