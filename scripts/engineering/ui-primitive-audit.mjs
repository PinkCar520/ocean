import ts from 'typescript';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base='packages/ui/src/components/';
const compare=(a,b)=>a<b?-1:a>b?1:0;
const hash=text=>createHash('sha256').update(text).digest('hex');
const relative=(root,p)=>path.relative(root,p).split(path.sep).join('/');
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
export function discoverPairs(tracked){
 const files=new Set(tracked);
 return tracked.filter(f=>f.startsWith(base)&&/^[^/]+\.tsx?$/.test(f.slice(base.length)))
  .map(left=>({left,right:base+'ui/'+left.slice(base.length)})).filter(p=>files.has(p.right))
  .sort((a,b)=>compare(a.left,b.left));
}
function readConfig(root){
 const config=path.join(root,'packages/ui/tsconfig.json');
 const loaded=ts.readConfigFile(config,ts.sys.readFile);
 if(loaded.error)throw Error('Cannot read UI compiler configuration');
 const parsed=ts.parseJsonConfigFileContent(loaded.config,ts.sys,path.dirname(config),undefined,config);
 const errors=parsed.errors.filter(e=>e.code!==18003);
 if(errors.length)throw Error('Invalid UI config: '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
 return {...parsed.options,noEmit:true,skipLibCheck:true,incremental:false,composite:false};
}
function isModuleLiteral(node){
 const p=node.parent;
 return !!p&&((ts.isImportDeclaration(p)||ts.isExportDeclaration(p))&&p.moduleSpecifier===node);
}
function runtimeShape(root,file,source,options){
 // Compare compiler-emitted runtime syntax while keeping string values,
 // directives, operators, control flow and resolved relative import identity.
 const compiled=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{
  module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,removeComments:true
 }});
 const diagnostics=(compiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
 const sf=ts.createSourceFile(file+'.js',compiled.outputText,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const unresolved=[];
 const absolute=path.join(root,file);
 function shape(node){
  if(ts.isStringLiteralLike(node)){
   let value=node.text;
   if(isModuleLiteral(node)&&value.startsWith('.')){
    const resolved=ts.resolveModuleName(value,absolute,options,ts.sys).resolvedModule?.resolvedFileName;
    if(!resolved)unresolved.push(value);
    else value=relative(root,realpathSync(resolved));
   }
   return [node.kind,value];
  }
  const children=node.getChildren(sf);
  return children.length?[node.kind,...children.map(shape)]:[node.kind,node.getText(sf)];
 }
 const canonical=shape(sf);
 return {hash:hash(JSON.stringify(canonical)),diagnostics,unresolved:[...new Set(unresolved)].sort(compare)};
}
function literalValues(sf){
 const values=new Set();
 function visit(n){
  if(ts.isStringLiteralLike(n)&&!isModuleLiteral(n))values.add(n.text);
  ts.forEachChild(n,visit);
 }
 visit(sf);
 return [...values].sort(compare);
}
function exported(checker,sf){
 const module=checker.getSymbolAtLocation(sf);
 if(!module)return new Map();
 return new Map(checker.getExportsOfModule(module).map(s=>{
  const target=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;
  const location=target.valueDeclaration??target.declarations?.[0]??sf;
  return [s.getName(),{
   value:target.flags&ts.SymbolFlags.Value?checker.getTypeOfSymbolAtLocation(target,location):null,
   type:target.flags&ts.SymbolFlags.Type?checker.getDeclaredTypeOfSymbol(target):null
  }];
 }));
}
function apiComparison(checker,a,b){
 const names=[...new Set([...a.keys(),...b.keys()])].sort(compare);
 return names.map(name=>{
  const left=a.get(name),right=b.get(name);
  const typeInfo=t=>t?{text:checker.typeToString(t,undefined,ts.TypeFormatFlags.NoTruncation),any:!!(t.flags&ts.TypeFlags.Any)}:null;
  const check=(l,r)=>l&&r?!(l.flags&ts.TypeFlags.Any)&&!(r.flags&ts.TypeFlags.Any)&&checker.isTypeAssignableTo(l,r)&&checker.isTypeAssignableTo(r,l):!l&&!r;
  return {name,left:left?{type:typeInfo(left.type),value:typeInfo(left.value)}:null,right:right?{type:typeInfo(right.type),value:typeInfo(right.value)}:null,
   mutuallyAssignable:!!left&&!!right&&check(left.type,right.type)&&check(left.value,right.value)};
 });
}
function entryExposure(report,file){
 return (report.entryPoints??[]).filter(e=>{
  if(e.candidates?.includes(file))return true;
  if(typeof e.target!=='string'||typeof e.packagePath!=='string'||!e.target.includes('*'))return false;
  const pattern=path.posix.normalize(e.packagePath+'/'+e.target);
  const [prefix,suffix]=pattern.split('*');
  return file.startsWith(prefix)&&file.endsWith(suffix??'');
 }).map(({workspace,field,condition,target})=>({workspace,field,condition,target}));
}
export function auditUi(root,tracked,report){
 root=realpathSync(root);
 const pairs=discoverPairs(tracked);
 const options=readConfig(root);
 const program=ts.createProgram(pairs.flatMap(p=>[p.left,p.right]).map(f=>path.join(root,f)),options);
 const checker=program.getTypeChecker();
 const inventory=new Map(report.files.map(f=>[f.path,f]));
 const records=pairs.map(({left,right})=>{
  const files=[left,right];
  const sfs=files.map(file=>{
   const source=program.getSourceFile(path.join(root,file));
   if(!source||inventory.get(file)?.sha256!==hash(readFileSync(path.join(root,file))))throw Error('Source report is missing or stale: '+file);
   return source;
  });
  const shapes=files.map((file,i)=>runtimeShape(root,file,sfs[i].text,options));
  const literals=sfs.map(literalValues);
  const diagnostics=sfs.map((sf,i)=>program.getSemanticDiagnostics(sf).filter(d=>d.category===ts.DiagnosticCategory.Error)
   .map(d=>({file:files[i],code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}))).flat();
  const api=apiComparison(checker,exported(checker,sfs[0]),exported(checker,sfs[1]));
  const runtimeAstMatch=shapes.every(s=>!s.diagnostics.length&&!s.unresolved.length)&&shapes[0].hash===shapes[1].hash;
  const apiMatch=!diagnostics.length&&api.length>0&&api.every(e=>e.mutuallyAssignable);
  const consumers=files.map(file=>({
   file,publicExportCandidates:entryExposure(report,file),
   importEdges:report.edges.filter(e=>e.target===file||e.sourceCandidates?.includes(file)),
   symbolUsages:(report.symbolUsages??[]).filter(u=>u.declarations?.some(d=>d.file===file))
  }));
  return {left,right,runtimeAstMatch,apiMatch,classification:runtimeAstMatch&&apiMatch?'structural-match-candidate':'differences-or-unproven',
   runtime:shapes,api,diagnostics,literalDifferences:{leftOnly:literals[0].filter(x=>!literals[1].includes(x)),rightOnly:literals[1].filter(x=>!literals[0].includes(x))},consumers};
 });
 return {schemaVersion:1,revision:report.revision,scope:'same-name files in packages/ui/src/components and components/ui only',
  unknownDynamicReferenceCount:report.unknownDynamicReferences.length,
  unresolvedEdgeCount:report.edges.filter(e=>e.status==='unresolved'||e.status==='ambiguous-source').length,
  summary:{pairs:records.length,structuralMatchCandidates:records.filter(p=>p.classification==='structural-match-candidate').length,otherPairs:records.filter(p=>p.classification!=='structural-match-candidate').length},
  records};
}
function main(){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error('Usage: node scripts/engineering/ui-primitive-audit.mjs SOURCE_REPORT OUTPUT');
 const root=git(process.cwd(),['rev-parse','--show-toplevel']).trim();
 const report=JSON.parse(readFileSync(input,'utf8'));
 if(report.revision?.commit!==git(root,['rev-parse','HEAD']).trim()||report.revision?.dirty||git(root,['status','--porcelain','--untracked-files=no']).trim())throw Error('UI audit requires the same clean tracked revision as source intelligence');
 const tracked=git(root,['ls-files','-z']).split('\0').filter(Boolean);
 const result=auditUi(root,tracked,report);
 writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({summary:result.summary,pairs:result.records.map(p=>({left:p.left,right:p.right,runtimeAstMatch:p.runtimeAstMatch,apiMatch:p.apiMatch,classification:p.classification,diagnostics:p.diagnostics.length}))},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
