import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const key = v => JSON.stringify([v.rule,v.from,v.to]);
export function collectViolations(reports) {
  const findings = new Map();
  for (const [context,report] of Object.entries(reports)) {
    if (!Array.isArray(report.modules) || !report.modules.length || !Array.isArray(report.summary?.violations)) throw Error('Invalid dependency report: '+context);
    for (const v of report.summary.violations) {
      if (v.rule?.severity !== 'error') continue;
      if (!v.rule.name || !v.from || !v.to) throw Error('Malformed architecture violation in '+context);
      const finding = {rule:v.rule.name,from:v.from,to:v.to};
      const id = key(finding);
      if (!findings.has(id)) findings.set(id,{...finding,contexts:[]});
      findings.get(id).contexts.push(context);
    }
  }
  return [...findings.values()].map(v=>({...v,contexts:[...new Set(v.contexts)].sort()})).sort((a,b)=>key(a).localeCompare(key(b),'en'));
}
export function compareBaseline(findings,baseline,today) {
  if (baseline.schemaVersion!==1 || !Array.isArray(baseline.exceptions)) throw Error('Invalid architecture baseline');
  const accepted=new Map();
  for (const e of baseline.exceptions) {
    if (![e.rule,e.from,e.to,e.reason,e.owner,e.expires].every(v=>typeof v==='string'&&v.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(e.expires) || Number.isNaN(Date.parse(e.expires)) || new Date(e.expires).toISOString().slice(0,10)!==e.expires) throw Error('Invalid architecture exception');
    const id=key(e);
    if (accepted.has(id)) throw Error('Duplicate architecture exception '+id);
    accepted.set(id,e);
  }
  const ids=new Set(findings.map(key));
  return {
    newViolations:findings.filter(v=>!accepted.has(key(v))),
    expired:findings.filter(v=>accepted.has(key(v))&&accepted.get(key(v)).expires<today),
    stale:baseline.exceptions.filter(e=>!ids.has(key(e)))
  };
}
function main() {
  const [dir,baselineFile]=process.argv.slice(2);
  if (!dir||!baselineFile) throw Error('Usage: architecture-gate.mjs GRAPH_DIRECTORY BASELINE');
  const summary=JSON.parse(readFileSync(path.join(dir,'summary.json'),'utf8'));
  if (!Array.isArray(summary)||!summary.length) throw Error('Missing graph contexts');
  const expected=summary.map(s=>s.name+'.json').sort();
  if (new Set(expected).size!==expected.length || expected.some(f=>path.basename(f)!==f||f==='summary.json')) throw Error('Invalid graph context names');
  const actual=readdirSync(dir).filter(f=>f.endsWith('.json')&&f!=='summary.json').sort();
  if (JSON.stringify(actual)!==JSON.stringify(expected)) throw Error('Graph report coverage mismatch');
  const reports=Object.fromEntries(expected.map(f=>[f.slice(0,-5),JSON.parse(readFileSync(path.join(dir,f),'utf8'))]));
  const findings=collectViolations(reports);
  const baseline=JSON.parse(readFileSync(baselineFile,'utf8'));
  const result=compareBaseline(findings,baseline,new Date().toISOString().slice(0,10));
  process.stdout.write(JSON.stringify({findings,...result},null,2)+'\n');
  if (result.newViolations.length||result.expired.length||result.stale.length) process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
