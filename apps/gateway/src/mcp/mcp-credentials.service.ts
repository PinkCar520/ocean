import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { mcpScopeKey, mcpUserHome } from './mcp-client.pool';

@Injectable()
export class MCPCredentialsService {
 constructor(@Optional() @Inject('MCP_CREDENTIAL_ROOT') private readonly root?: string) {}

 async replace(userId: string, input: Record<string, string>): Promise<{ configuredKeys: string[] }> {
  mcpScopeKey({ userId });
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid credential environment');
  const entries = Object.entries(input);
  if (entries.some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) || typeof value !== 'string' || value.length > 8192 || value.includes('\0'))) {
   throw new BadRequestException('Invalid credential environment');
  }
  const content = JSON.stringify(Object.fromEntries(entries));
  if (Buffer.byteLength(content) > 64 * 1024) throw new BadRequestException('Credential environment too large');
  const home = mcpUserHome({ userId }, this.root);
  const base = dirname(home);
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  for (const directory of [home, join(home, '.ocean')]) {
   try { await fs.mkdir(directory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
   const info = await fs.lstat(directory);
   if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('Unsafe MCP credential directory');
  }
  const directory = join(home, '.ocean');
  const file = join(directory, 'mcp.env.json');
  const temporary = join(directory, `.mcp.env-${randomUUID()}.tmp`);
  try {
   const handle = await fs.open(temporary, 'wx', 0o600);
   try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
   await fs.rename(temporary, file);
   const parent = await fs.open(directory, 'r');
   try { await parent.sync(); } finally { await parent.close(); }
  } finally { await fs.rm(temporary, { force: true }); }
  return { configuredKeys: entries.map(([key]) => key).sort() };
 }
}
