import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const ids=Array.from({length:8},(_,i)=>'EH-0'+(i+1));
const statuses=new Set(['NOT_IMPLEMENTED','PARTIAL','IMPLEMENTED_UNVERIFIED','FAILED','VERIFIED']);
export function validateUiTrial(trial,tracked){
 const expected=Array.from({length:8},(_,i)=>'UI-M0'+(i+1));
 if(!trial||trial.scope!=='packages/ui'||!Array.isArray(trial.modules)||JSON.stringify(trial.modules.map(m=>m.id))!==JSON.stringify(expected))throw Error('Invalid UI trial module inventory');
 for(const m of trial.modules){
  if(!statuses.has(m.status)||typeof m.name!=='string'||!m.name.trim()||!Array.isArray(m.evidence)||!Array.isArray(m.remaining))throw Error('Invalid UI module '+m.id);
  if(m.status!=='NOT_IMPLEMENTED'&&!m.evidence.length)throw Error('Missing UI implementation evidence '+m.id);
  if(m.evidence.some(p=>typeof p!=='string'||!tracked.has(p)))throw Error('Untracked UI evidence '+m.id);
  if(m.status!=='VERIFIED'&&!m.remaining.length)throw Error('Missing UI remaining work '+m.id);
  if(m.status==='VERIFIED'&&(m.remaining.length||m.acceptance?.status!=='ACCEPTED'||!m.acceptance.reviewer||!m.acceptance.commit?.match(/^[a-f0-9]{40}$/)||!m.acceptance.evidence?.length))throw Error('Missing independent UI acceptance '+m.id);
 }
 return trial.modules.map(m=>({id:m.id,status:m.status,evidence:m.evidence.length,remaining:m.remaining.length}));
}
export function validateLedger(ledger,tracked){
 if(ledger.schemaVersion!==1||!Array.isArray(ledger.modules)||ledger.modules.length!==ids.length)throw Error('Invalid module ledger');
 if(JSON.stringify(ledger.modules.map(m=>m.id))!==JSON.stringify(ids))throw Error('Missing, duplicate or unordered module IDs');
 for(const m of ledger.modules){
  if(typeof m.name!=='string'||!m.name.trim()||!statuses.has(m.status)||!Array.isArray(m.evidence)||!Array.isArray(m.remaining))throw Error('Invalid module '+m.id);
  if(m.status!=='NOT_IMPLEMENTED'&&!m.evidence.length)throw Error('Missing implementation evidence '+m.id);
  for(const p of m.evidence)if(typeof p!=='string'||!tracked.has(p)||path.posix.normalize(p)!==p)throw Error('Untracked evidence: '+m.id+' '+p);
  if(m.status!=='VERIFIED'&&m.remaining.length===0)throw Error('Missing remaining acceptance work '+m.id);
  if(m.status==='VERIFIED'){
   if(m.remaining.length||!m.acceptance||m.acceptance.status!=='ACCEPTED'||!m.acceptance.reviewer||!m.acceptance.commit?.match(/^[a-f0-9]{40}$/)||!Array.isArray(m.acceptance.evidence)||!m.acceptance.evidence.length)throw Error('Missing independent acceptance record: '+m.id);
  }
 }
 if(!ledger.acceptance||!['PENDING','ACCEPTED','REJECTED'].includes(ledger.acceptance.status)||!Array.isArray(ledger.acceptance.evidence))throw Error('Invalid independent acceptance state');
 if(ledger.acceptance.status==='ACCEPTED'&&(ledger.modules.some(m=>m.status!=='VERIFIED')||ledger.uiTrial?.modules?.some(m=>m.status!=='VERIFIED')||!ledger.acceptance.reviewer||!ledger.acceptance.commit?.match(/^[a-f0-9]{40}$/)||!ledger.acceptance.evidence.length))throw Error('Global acceptance lacks module evidence');
 return ledger.modules.map(m=>({id:m.id,status:m.status,evidence:m.evidence.length,remaining:m.remaining.length}));
}
export function brokenMarkdownLinks(file,content,tracked){
 const failures=[];
 for(const match of content.matchAll(/\]\(([^\s)]+)\)/g)){
  const href=match[1];
  if(href.startsWith('#')||/^[a-z][a-z0-9+.-]*:/i.test(href))continue;
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),href.split('#')[0]));
  if(!tracked.has(target)&&![...tracked].some(p=>p.startsWith(target+'/')))failures.push({file,href,target});
 }
 return failures;
}
function main(){
 const tracked=new Set(execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).split('\0').filter(Boolean));
 const ledger=JSON.parse(readFileSync(path.join(root,'docs/engineering-harness/manifest.json'),'utf8'));
 const modules=validateLedger(ledger,tracked);
 const uiTrial=validateUiTrial(ledger.uiTrial,tracked);
 const missing=ledger.modules.flatMap(m=>m.evidence.filter(p=>!existsSync(path.join(root,p))));
 const broken=[...tracked].filter(p=>p==='AGENTS.md'||p.startsWith('docs/engineering-harness/')&&p.endsWith('.md')).flatMap(p=>brokenMarkdownLinks(p,readFileSync(path.join(root,p),'utf8'),tracked));
 process.stdout.write(JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),modules,uiTrial,missing,broken,acceptance:ledger.acceptance.status},null,2)+'\n');
 if(missing.length||broken.length)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
