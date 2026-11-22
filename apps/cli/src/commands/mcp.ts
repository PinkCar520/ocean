import { Command, Option } from 'commander';
import { configFile, mutateServers, readServers, type McpScope } from '../mcp/config-store.js';
import { normalizeMcpConfig } from '../mcp/client.js';

function entries(values: string[], separator: string): Record<string,string> {
  return Object.fromEntries(values.map(value => {
    const i = value.indexOf(separator);
    if(i<1) throw new Error('Invalid environment or header option');
    return [value.slice(0,i).trim(),value.slice(i+1).trim()];
  }));
}
export function registerMcpCommands(program: Command) {
  const mcp = program.command('mcp').description('Manage MCP servers');
  const scope = () => new Option('-s, --scope <scope>').choices(['local','project','user']).default('local');
  const file = (s: McpScope) => configFile(s,process.cwd());
  const add = (name: string, raw: unknown, s: McpScope) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected a server configuration object');
    const entry = normalizeMcpConfig({mcpServers:[{...raw,id:name,enabled:true}]}).mcpServers[0];
    mutateServers(file(s), servers => {
      if(servers.some(x=>x.id===name)) throw new Error('MCP server already exists in this scope');
      return [...servers,entry];
    });
    console.log('Added '+name+' ('+s+')');
  };
  mcp.command('add').addOption(scope()).addOption(new Option('-t, --transport <type>').choices(['stdio','http','sse']).default('stdio'))
    .option('-e, --env <pair>','Environment variable',(v,a:string[])=>[...a,v],[])
    .option('-H, --header <pair>','HTTP header',(v,a:string[])=>[...a,v],[])
    .argument('<name>').argument('<target>').argument('[args...]')
    .action((name,target,args,opts)=>{
      if(opts.transport!=='stdio' && args.length) throw new Error('Remote MCP accepts one URL');
      add(name,opts.transport==='stdio'?{command:target,args,env:entries(opts.env,'=')}:{type:opts.transport,url:target,headers:entries(opts.header,':')},opts.scope);
    });
  mcp.command('add-json').addOption(scope()).argument('<name>').argument('<json>').action((name,json,opts)=>add(name,JSON.parse(json),opts.scope));
  const resolved = () => {
    const map = new Map<string,{id:string;scope:McpScope;type:string;enabled:boolean}>();
    for(const s of ['user','project','local'] as const) for(const entry of readServers(file(s))) map.set(entry.id,{id:entry.id,scope:s,type:entry.type??'stdio',enabled:entry.enabled===true});
    return [...map.values()];
  };
  mcp.command('list').action(()=>{for(const e of resolved()) console.log(e.id+' · '+e.scope+' · '+e.type+' · '+(!e.enabled?'disabled':e.scope==='project'?'pending approval':'configured'));});
  mcp.command('get').argument('<name>').action(name=>{const e=resolved().find(x=>x.id===name);if(!e) throw new Error('Unknown MCP server');console.log(JSON.stringify(e,null,2));});
  mcp.command('remove').addOption(scope()).argument('<name>').action((name,opts)=>mutateServers(file(opts.scope),servers=>{if(!servers.some(x=>x.id===name)) throw new Error('Unknown MCP server in scope');return servers.filter(x=>x.id!==name);}));
}
