import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectViolations,compareBaseline } from './architecture-gate.mjs';
const bad={rule:{name:'core-cannot-import-host',severity:'error'},from:'packages/shared/core/src/a.ts',to:'apps/web/src/b.ts'};
const report=violations=>({modules:[{source:'a.ts'}],summary:{violations}});
const empty={schemaVersion:1,exceptions:[]};
test('deduplicates repeated contexts but rejects each new forbidden dependency',()=>{
 const found=collectViolations({web:report([bad]),core:report([bad])});
 assert.equal(found.length,1);
 assert.deepEqual(found[0].contexts,['core','web']);
 assert.equal(compareBaseline(found,empty,'2026-11-27').newViolations.length,1);
});
test('exceptions must be exact, documented, unexpired and still necessary',()=>{
 const found=collectViolations({core:report([bad])});
 const {contexts,...edge}=found[0];
 const baseline={schemaVersion:1,exceptions:[{...edge,reason:'Tracked debt',owner:'core',expires:'2026-12-01'}]};
 assert.deepEqual(compareBaseline(found,baseline,'2026-11-27'),{newViolations:[],expired:[],stale:[]});
 assert.equal(compareBaseline(found,baseline,'2026-12-02').expired.length,1);
 assert.equal(compareBaseline([],baseline,'2026-11-27').stale.length,1);
 assert.equal(compareBaseline([{...found[0],to:'apps/web/src/c.ts'}],baseline,'2026-11-27').newViolations.length,1);
 assert.throws(()=>compareBaseline(found,{schemaVersion:1,exceptions:[edge]},'2026-11-27'));
});
test('incomplete graph cannot be silently treated as clean',()=>{
 assert.throws(()=>collectViolations({core:{modules:[],summary:{violations:[]}}}),/Invalid dependency report/);
});
