import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLedger,validateUiTrial,brokenMarkdownLinks} from './governance.mjs';
const ledger={schemaVersion:1,modules:Array.from({length:8},(_,i)=>({id:'EH-0'+(i+1),name:'Module '+i,status:'PARTIAL',evidence:['a.ts'],remaining:['independent review']})),acceptance:{status:'PENDING',evidence:[]}};
test('ledger requires complete ordered modules and tracked evidence',()=>{
 assert.equal(validateLedger(ledger,new Set(['a.ts'])).length,8);
 const missing=structuredClone(ledger);missing.modules.pop();assert.throws(()=>validateLedger(missing,new Set(['a.ts'])),/Invalid module ledger/);
 assert.throws(()=>validateLedger(ledger,new Set()),/Untracked evidence/);
});
test('implementation cannot declare independent acceptance without evidence',()=>{
 const changed=structuredClone(ledger);changed.modules[0].status='VERIFIED';changed.modules[0].remaining=[];
 assert.throws(()=>validateLedger(changed,new Set(['a.ts'])),/Missing independent acceptance/);
 changed.acceptance.status='ACCEPTED';assert.throws(()=>validateLedger(changed,new Set(['a.ts'])));
});
test('relative documentation links are checked without treating public URLs as repo files',()=>{
 const result=brokenMarkdownLinks('docs/engineering-harness/readme.md','[good](../../a.ts) [missing](gone.md) [web](https://example.org) [section](#x)',new Set(['a.ts']));
 assert.deepEqual(result,[{file:'docs/engineering-harness/readme.md',href:'gone.md',target:'docs/engineering-harness/gone.md'}]);
});

test('UI trial ledger covers each module and cannot invent independent verification',()=>{
 const trial={scope:'packages/ui',modules:Array.from({length:8},(_,i)=>({id:'UI-M0'+(i+1),name:'UI '+i,status:'NOT_IMPLEMENTED',evidence:[],remaining:['work']}))};
 assert.equal(validateUiTrial(trial,new Set()).length,8);
 trial.modules[0].status='VERIFIED';
 trial.modules[0].evidence=['a.ts'];trial.modules[0].remaining=[];
 assert.throws(()=>validateUiTrial(trial,new Set(['a.ts'])),/Missing independent UI acceptance/);
});
