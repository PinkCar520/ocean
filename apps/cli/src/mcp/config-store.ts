import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeMcpConfig, type McpServerEntry } from './client.js';

export type McpScope = 'local' | 'project' | 'user';
export function configFile(scope: McpScope, workspace: string, home = homedir()): string {
  if (scope === 'user') return path.join(home,'.ocean','mcp.json');
  if (scope === 'project') return path.join(workspace,'.ocean','mcp.json');
  if (scope !== 'local') throw new Error('Invalid MCP scope');
  return path.join(home,'.ocean','projects',createHash('sha256').update(fs.realpathSync(workspace)).digest('hex'),'mcp.json');
}
export function readServers(file: string): McpServerEntry[] {
  if (!fs.existsSync(file)) return [];
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.size > 256*1024) throw new Error('Unsafe MCP configuration');
  return normalizeMcpConfig(JSON.parse(fs.readFileSync(file,'utf8'))).mcpServers;
}
export function mutateServers(file: string, update: (servers: McpServerEntry[]) => McpServerEntry[]): void {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const lock = file+'.lock';
  const fd = fs.openSync(lock,'wx',0o600);
  const temp = file+'.'+randomUUID();
  try {
    const servers = normalizeMcpConfig({mcpServers:update(readServers(file))}).mcpServers;
    fs.writeFileSync(temp,JSON.stringify({mcpServers:servers},null,2)+'\n',{flag:'wx',mode:0o600});
    fs.renameSync(temp,file);
  } finally {
    if(fs.existsSync(temp)) fs.unlinkSync(temp);
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
