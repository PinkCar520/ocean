import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const pnpm=process.platform==='win32'?'pnpm.cmd':'pnpm';
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
export function validateMatrix(manifests,matrix){
 if(matrix.schemaVersion!==1||!Array.isArray(matrix.workspaces))throw Error('Invalid verification matrix');
 const byName=new Map();
 for(const m of manifests){
  if(!m.name||byName.has(m.name))throw Error('Invalid or duplicate workspace: '+m.name);
  byName.set(m.name,m);
 }
 const covered=new Set();
 for(const entry of matrix.workspaces){
  const m=byName.get(entry.name);
  if(!m||covered.has(entry.name))throw Error('Unknown or duplicate matrix workspace: '+entry.name);
  covered.add(entry.name);
  if(!Array.isArray(entry.checks)||!Array.isArray(entry.external)||!Array.isArray(entry.gaps))throw Error('Invalid workspace verification declaration: '+entry.name);
  for(const command of entry.checks){
   if(!Array.isArray(command)||!command.length||!m.scripts?.[command[0]])throw Error('Missing workspace command: '+entry.name+' '+command);
  }
  const indirect=entry.indirect??[];
  if(!Array.isArray(indirect))throw Error('Invalid indirect coverage: '+entry.name);
  for(const c of indirect){
   if(!m.scripts?.[c.script]||!entry.checks.some(args=>args[0]===c.via)||!m.scripts[c.via].split('&&').some(command=>command.trim()==='pnpm run '+c.script))throw Error('Unproven indirect coverage: '+entry.name+' '+c.script);
  }
  const accounted=new Set([...entry.checks.map(c=>c[0]),...entry.external.map(c=>c.script),...indirect.map(c=>c.script)]);
  for(const command of ['build','typecheck','test']){
   if(m.scripts?.[command]&&!accounted.has(command))throw Error('Uncovered script: '+entry.name+' '+command);
  }
  for(const c of entry.external)if(!m.scripts?.[c.script]||!c.workflow||!c.evidence)throw Error('Invalid external coverage: '+entry.name);
  if(!entry.checks.length&&!entry.external.length&&!entry.gaps.length)throw Error('Empty coverage declaration: '+entry.name);
 }
 for(const name of byName.keys())if(!covered.has(name))throw Error('Workspace missing from matrix: '+name);
}
function main(){
 const output=process.argv[2];
 if(!output)throw Error('Usage: node scripts/engineering/verification.mjs OUTPUT_DIRECTORY');
 mkdirSync(output,{recursive:true});
 const tracked=git(['ls-files','-z']).split('\0').filter(Boolean);
 const manifests=tracked.filter(p=>/^(apps|packages|agents)\/.*\/package\.json$/.test(p)).map(p=>JSON.parse(readFileSync(path.join(root,p),'utf8')));
 const matrix=JSON.parse(readFileSync(new URL('./verification-matrix.json',import.meta.url),'utf8'));
 validateMatrix(manifests,matrix);
 for(const e of matrix.workspaces)for(const c of e.external){
  if(!tracked.includes(c.workflow)||!readFileSync(path.join(root,c.workflow),'utf8').includes(c.evidence))throw Error('Missing declared workflow evidence: '+e.name+' '+c.script);
 }
 const report={revision:git(['rev-parse','HEAD']).trim(),results:[],external:matrix.workspaces.flatMap(e=>e.external.map(c=>({workspace:e.name,...c}))),gaps:matrix.workspaces.flatMap(e=>e.gaps.map(reason=>({workspace:e.name,reason})))};
 const persist=()=>writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
 persist();
 for(const entry of matrix.workspaces){
  for(const args of entry.checks){
   const invocation=['--filter',entry.name,'--fail-if-no-match','run',...args];
   console.log('Verification: pnpm '+invocation.join(' '));
   const result=spawnSync(pnpm,invocation,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
   report.results.push({workspace:entry.name,args,status:result.status,error:result.error?.message??null});
   persist();
   if(result.error||result.status!==0){process.exitCode=1;return}
  }
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
