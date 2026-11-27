import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function runTool(args, cwd = root) {
  const [tool,...flags] = args;
  if (!['knip','jscpd','depcruise'].includes(tool)) throw new Error('Unsupported engineering tool: '+tool);
  const binary = path.join(root,'node_modules','.bin',tool+(process.platform === 'win32' ? '.cmd' : ''));
  const run = spawnSync(binary, flags, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, shell: process.platform === 'win32' });
  if (run.error) throw run.error;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
export function jsonResult(result, label, permittedStatuses = [0]) {
  if (!permittedStatuses.includes(result.status)) throw new Error(label + ' failed (' + result.status + '): ' + result.stderr + '\n' + result.stdout.slice(-3000));
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(label + ' did not emit JSON: ' + result.stderr + '\n' + result.stdout.slice(0,2000)); }
}
const graphs = [
  ['web','apps/web/src','apps/web/tsconfig.json'],
  ['desktop-main','apps/desktop/src/main','apps/desktop/tsconfig.node.json'],
  ['desktop-preload','apps/desktop/src/preload','apps/desktop/tsconfig.node.json'],
  ['desktop-renderer','apps/desktop/src/renderer/src','apps/desktop/tsconfig.web.json'],
  ['gateway','apps/gateway/src','apps/gateway/tsconfig.json'],
  ['cli','apps/cli/src','apps/cli/tsconfig.json'],
  ['ui','packages/ui/src','packages/ui/tsconfig.json'],
  ['contracts','packages/contracts/src','packages/contracts/tsconfig.json'],
  ['core','packages/shared/core/src','packages/shared/core/tsconfig.json'],
  ['sandbox','packages/shared/sandbox/src','packages/shared/sandbox/tsconfig.json'],
  ...['gitlab','jenkins','zentao'].map(n => ['tools-'+n,'packages/tools/'+n+'/src','packages/tools/'+n+'/tsconfig.json']),
  ...['gitlab','im','jenkins','zentao'].map(n => ['mcp-'+n,'agents/mcp/mcp-'+n+'/src','agents/mcp/mcp-'+n+'/tsconfig.json'])
];
function graph(output) {
  mkdirSync(output,{recursive:true});
  const summary = [];
  for (const [name,entry,config] of graphs) {
    if (!existsSync(path.join(root,entry)) || !existsSync(path.join(root,config))) throw new Error('Missing graph scope: '+name);
    const result = runTool(['depcruise','--config','.dependency-cruiser.cjs','--ts-config',config,'--output-type','json',entry]);
    const report = jsonResult(result,name,[0,1]);
    if (!Array.isArray(report.modules) || !report.modules.length || !Array.isArray(report.summary?.violations)) throw new Error('Incomplete graph: '+name);
    writeFileSync(path.join(output,name+'.json'),JSON.stringify(report,null,2)+'\n');
    summary.push({name,entry,config,modules:report.modules.length,violations:report.summary.violations.length,status:result.status});
  }
  writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
}
function health(output) {
  mkdirSync(output,{recursive:true});
  const dead = jsonResult(runTool(['knip','--reporter','json','--no-exit-code']),'knip');
  if (!Array.isArray(dead.issues)) throw new Error('Unexpected Knip report schema');
  writeFileSync(path.join(output,'knip.json'),JSON.stringify(dead,null,2)+'\n');
  const duplicates = path.join(output,'duplicates');
  mkdirSync(duplicates,{recursive:true});
  const result = runTool(['jscpd','apps','packages','agents','scripts','--config','.jscpd.json','--output',duplicates]);
  if (result.status !== 0) throw new Error('jscpd failed: '+result.stderr+'\n'+result.stdout.slice(-3000));
  const report = JSON.parse(readFileSync(path.join(duplicates,'jscpd-report.json'),'utf8'));
  if (!Array.isArray(report.duplicates) || !report.statistics) throw new Error('Unexpected jscpd report schema');
  graph(path.join(output,'graph'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode,output = 'reports/engineering'] = process.argv.slice(2);
  if (mode === 'health') health(path.resolve(output));
  else if (mode === 'graph') graph(path.resolve(output,'graph'));
  else throw new Error('Usage: toolchain.mjs health|graph [output]');
}
