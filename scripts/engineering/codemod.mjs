import ts from 'typescript';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './source-intelligence.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const git = (root,args) => execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
const order = (a,b) => a<b?-1:a>b?1:0;
const allowed = /^(apps|packages|agents|scripts)\/.*\.[cm]?[jt]sx?$/;
function checkedPath(root,file,tracked) {
  if (typeof file!=='string'||path.posix.normalize(file)!==file||file.includes('\\')||!allowed.test(file)||!tracked.has(file)) throw Error('Not an eligible tracked source: '+file);
  const absolute=path.join(root,file);
  if (!lstatSync(absolute).isFile()||realpathSync(absolute)!==absolute) throw Error('Symlink or nonregular source: '+file);
  return absolute;
}
function compilerOptions(root,config,tracked) {
  if (typeof config!=='string'||path.posix.normalize(config)!==config||!tracked.has(config)||!/(?:^|\/)tsconfig(?:\.[\w-]+)?\.json$/.test(config)) throw Error('Invalid tracked compiler config: '+config);
  const absolute=path.join(root,config);
  if(realpathSync(absolute)!==absolute) throw Error('Symlink config: '+config);
  const read=ts.readConfigFile(absolute,ts.sys.readFile);
  if(read.error)throw Error('Cannot read config: '+config);
  const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(absolute),undefined,absolute);
  const errors=parsed.errors.filter(e=>e.code!==18003);
  if(errors.length)throw Error('Cannot parse config '+config+': '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
  return parsed.options;
}
export function transform(source,file,from,to) {
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  if(sf.parseDiagnostics.length)throw Error('Unparseable source: '+file);
  const edits=[];
  function add(literal) {
    if(!literal||!ts.isStringLiteralLike(literal)||literal.text!==from)return;
    const start=literal.getStart(sf),end=literal.getEnd();
    const quote=source[start];
    if(!['"',"'","`"].includes(quote)||to.includes(quote)||/[\\\r\n]/.test(to)||(quote==="`"&&to.includes('${')))throw Error('Unsafe replacement literal: '+to);
    edits.push({start,end,replacement:quote+to+quote});
  }
  function visit(node) {
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))add(node.moduleSpecifier);
    else if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference))add(node.moduleReference.expression);
    else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))add(node.argument.literal);
    else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)add(node.arguments[0]);
    // require() can be shadowed; do not rewrite it without a symbol proof.
    ts.forEachChild(node,visit);
  }
  visit(sf);
  let result=source;
  for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.replacement+result.slice(e.end);
  return {result,edits:edits.reverse()};
}
export function plan(root,trackedFiles,rules,revision=null) {
  root=realpathSync(root);
  const tracked=new Set(trackedFiles);
  if(!Array.isArray(rules)||!rules.length)throw Error('At least one explicit rewrite rule is required');
  const byFile=new Map();
  const sourceReport=analyze(root,trackedFiles,revision===null?null:{commit:revision,dirty:false});
  const inventory=new Map(sourceReport.files.map(f=>[f.path,f]));
  if(sourceReport.coverage.missing.length)throw Error('Incomplete source intelligence; cannot plan a safe rewrite');
  for(const rule of rules){
    if(!rule||typeof rule.from!=='string'||typeof rule.to!=='string'||!rule.from||!rule.to||rule.from===rule.to||!Array.isArray(rule.configs)||!rule.configs.length)throw Error('Invalid rewrite rule');
    const absolute=checkedPath(root,rule.file,tracked);
    if(!byFile.has(rule.file))byFile.set(rule.file,{absolute,source:readFileSync(absolute,'utf8'),rules:[]});
    const state=byFile.get(rule.file);
    const record=inventory.get(rule.file);
    if(!record||record.sha256!==hash(state.source)||!record.configs.length||record.contexts.some(c=>c.config===null))throw Error('Missing compiler context coverage: '+rule.file);
    const requested=[...new Set(rule.configs)].sort(order);
    if(JSON.stringify(requested)!==JSON.stringify(record.configs))throw Error('Rule must cover every observed compiler context: '+rule.file+' '+record.configs.join(', '));
    const oldEdges=sourceReport.edges.filter(e=>e.from===rule.file&&e.specifier===rule.from);
    if(!oldEdges.length||oldEdges.some(e=>!['import','reexport','import-equals','import-type','dynamic-import'].includes(e.kind)||e.status!=='source'))throw Error('Unsupported or unresolved existing module edge: '+rule.file+' '+rule.from);
    if(state.rules.some(r=>r.from===rule.from||r.from===rule.to||r.to===rule.from))throw Error('Overlapping rewrite rules: '+rule.file);
    // Compare real module targets in every explicitly selected compiler context.
    // No rewrite of different implementations or unresolved imports is allowed.
    const resolutions=[];
    for(const config of [...new Set(rule.configs)].sort(order)){
      const options=compilerOptions(root,config,tracked);
      const resolve=(specifier,mode)=>{
        const result=ts.resolveModuleName(specifier,absolute,options,ts.sys,undefined,undefined,mode).resolvedModule?.resolvedFileName;
        return result?realpathSync(result):null;
      };
      // Check both import and require conditional resolutions conservatively.
      // A mode-dependent or unresolved package target must be handled separately.
      const targets=new Set();
      for(const mode of [ts.ModuleKind.ESNext,ts.ModuleKind.CommonJS]){
        const old=resolve(rule.from,mode),next=resolve(rule.to,mode);
        if(!old||!next||old!==next)throw Error('Module identity not preserved: '+rule.file+' ('+config+'): '+rule.from+' -> '+rule.to);
        targets.add(path.relative(root,old).split(path.sep).join('/'));
      }
      if(targets.size!==1)throw Error('Mode-dependent module identity: '+rule.file+' '+rule.from);
      const [target]=targets;
      if(!tracked.has(target)||!oldEdges.filter(e=>e.config===config).length||oldEdges.some(e=>e.config===config&&e.target!==target))throw Error('Target does not match compiler evidence: '+target);
      resolutions.push({config,target});
    }
    state.rules.push({...rule,resolutions});
  }
  const changes=[];
  for(const [file,state] of [...byFile].sort(([a],[b])=>order(a,b))){
    let result=state.source;
    const applied=[];
    for(const rule of state.rules){
      const transformed=transform(result,state.absolute,rule.from,rule.to);
      if(!transformed.edits.length)throw Error('No matching AST module literal: '+file+' '+rule.from);
      result=transformed.result;
      applied.push({from:rule.from,to:rule.to,resolutions:rule.resolutions,count:transformed.edits.length});
    }
    if(ts.createSourceFile(state.absolute,result,ts.ScriptTarget.Latest,true).parseDiagnostics.length)throw Error('Rewrite produced invalid syntax: '+file);
    changes.push({file,beforeHash:hash(state.source),afterHash:hash(result),rules:applied,result});
  }
  return {schemaVersion:1,revision,changes};
}
export function apply(root,trackedFiles,savedPlan,currentRevision=null) {
  root=realpathSync(root);
  if(savedPlan.schemaVersion!==1||savedPlan.revision!==currentRevision||!Array.isArray(savedPlan.changes)||!savedPlan.changes.length)throw Error('Invalid or stale plan');
  // Rebuild from current inputs rather than trust executable content in a saved report.
  const rules=savedPlan.changes.flatMap(c=>c.rules.map(r=>({file:c.file,from:r.from,to:r.to,configs:r.resolutions.map(x=>x.config)})));
  const fresh=plan(root,trackedFiles,rules,currentRevision);
  if(JSON.stringify(fresh)!==JSON.stringify(savedPlan))throw Error('Plan drift: rerun preview');
  const tracked=new Set(trackedFiles);
  const originals=fresh.changes.map(c=>{
    const absolute=checkedPath(root,c.file,tracked),source=readFileSync(absolute,'utf8');
    if(hash(source)!==c.beforeHash)throw Error('Source changed: '+c.file);
    return {absolute,source,change:c};
  });
  const written=[];
  try{
    for(const item of originals){
      if(hash(readFileSync(item.absolute,'utf8'))!==item.change.beforeHash)throw Error('Source changed during apply: '+item.change.file);
      written.push(item);
      writeFileSync(item.absolute,item.change.result);
    }
  }catch(error){
    for(const item of written.reverse())writeFileSync(item.absolute,item.source);
    throw error;
  }
  return fresh.changes.map(({file,beforeHash,afterHash})=>({file,beforeHash,afterHash}));
}
function main(){
  const root=git(process.cwd(),['rev-parse','--show-toplevel']).trim();
  const tracked=git(root,['ls-files','-z']).split('\0').filter(Boolean);
  const revision=git(root,['rev-parse','HEAD']).trim();
  const [mode,input,output]=process.argv.slice(2);
  if(mode==='plan'&&input&&output){
    const rules=JSON.parse(readFileSync(input,'utf8'));
    const result=plan(root,tracked,rules,revision);
    writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  }else if(mode==='apply'&&input&&!output){
    if(git(root,['status','--porcelain','--untracked-files=no']).trim())throw Error('Apply requires a clean tracked worktree');
    const result=apply(root,tracked,JSON.parse(readFileSync(input,'utf8')),revision);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }else throw Error('Usage: node scripts/engineering/codemod.mjs plan RULES.json PLAN.json | apply PLAN.json');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
