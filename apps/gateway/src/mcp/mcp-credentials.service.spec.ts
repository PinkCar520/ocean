jest.mock('ai', () => ({ tool: jest.fn(), jsonSchema: jest.fn() }));
import { mkdtemp, rm, stat, mkdir, symlink, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MCPCredentialsService } from './mcp-credentials.service';
import { mcpUserHome, readMCPUserEnv } from './mcp-client.pool';

describe('MCP credential provisioning', () => {
 it('isolates principals, atomically replaces secrets and never returns secret values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-credentials-'));
  try {
   const service = new MCPCredentialsService(root);
   expect(await service.replace('alice', { TOKEN: 'secret' })).toEqual({ configuredKeys: ['TOKEN'] });
   expect(await readMCPUserEnv(mcpUserHome({ userId: 'alice' }, root))).toEqual({ TOKEN: 'secret' });
   expect(await readMCPUserEnv(mcpUserHome({ userId: 'bob' }, root))).toEqual({});
   expect((await stat(join(mcpUserHome({ userId: 'alice' }, root), '.ocean', 'mcp.env.json'))).mode & 0o777).toBe(0o600);
   await service.replace('alice', {});
   expect(await readMCPUserEnv(mcpUserHome({ userId: 'alice' }, root))).toEqual({});
   await expect(service.replace('alice', { 'bad-key': 'x' })).rejects.toThrow();
   await expect(service.replace('alice', { TOKEN: 3 } as any)).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
 });
 it('refuses tenant directory symlinks without touching their target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-credentials-link-'));
  try {
   const target = join(root, 'other'); await mkdir(target);
   await symlink(target, mcpUserHome({ userId: 'alice' }, root));
   await expect(new MCPCredentialsService(root).replace('alice', { TOKEN: 'secret' })).rejects.toThrow();
   await expect(readFile(join(target, '.ocean', 'mcp.env.json'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
 });
 it('refuses to read another tenant environment through a symlinked home', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-credential-read-link-'));
  try {
   const target = join(root, 'other'); await mkdir(join(target, '.ocean'), { recursive: true });
   await writeFile(join(target, '.ocean', 'mcp.env.json'), JSON.stringify({ TOKEN: 'other-secret' }), { mode: 0o600 });
   const home = mcpUserHome({ userId: 'alice' }, root); await symlink(target, home);
   await expect(readMCPUserEnv(home)).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
 });

});
