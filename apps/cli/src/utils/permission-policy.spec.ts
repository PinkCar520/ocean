import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionPolicy } from './permission-policy.js';

describe('CLI permission policy', () => {
  let tempRoot = '';

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    tempRoot = '';
  });

  async function createRoots() {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-permission-'));
    const workspace = path.join(tempRoot, 'workspace');
    const home = path.join(tempRoot, 'home');
    await mkdir(workspace);
    await mkdir(home);
    return { workspace, home };
  }

  it('uses safe default decisions and argument-scoped rules', async () => {
    const { workspace, home } = await createRoots();
    const policy = new PermissionPolicy(workspace, home);

    expect(policy.evaluate('file_read', { path: 'src/main.ts' })).toBe('allow');
    expect(policy.evaluate('bash', { command: 'pwd' })).toBe('allow');
    expect(policy.evaluate('local_git', { action: 'status' })).toBe('allow');
    expect(policy.evaluate('file_write', { path: 'src/main.ts' })).toBe('ask');
    expect(policy.evaluate('bash', { command: 'git commit -m update' })).toBe('ask');

    await mkdir(path.join(workspace, '.ocean'));
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({
      mode: 'bypassPermissions',
      deny: ['Edit(secrets/**)'],
      allow: ['Bash(*)'],
      ask: ['Bash(git push:*)'],
    }));
    const configured = new PermissionPolicy(workspace, home);
    expect(configured.evaluate('file_edit', { path: 'secrets/token.txt' })).toBe('deny');
    expect(configured.evaluate('bash', { command: 'git push origin main' })).toBe('ask');
    expect(configured.evaluate('bash', { command: 'pnpm build' })).toBe('allow');

    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({
      mode: 'default', allow: ['Bash(*)'], ask: ['Bash(git push:*)'],
    }));
    expect(new PermissionPolicy(workspace, home).evaluate('bash', { command: 'git push origin main' })).toBe('ask');

    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({ mode: 'dontAsk' }));
    const dontAsk = new PermissionPolicy(workspace, home);
    expect(dontAsk.evaluate('file_read', { path: 'README.md' })).toBe('allow');
    expect(dontAsk.evaluate('file_write', { path: 'notes.txt' })).toBe('deny');
  });

  it('honors user/project/local precedence while keeping deny global', async () => {
    const { workspace, home } = await createRoots();
    await mkdir(path.join(home, '.ocean'));
    await mkdir(path.join(workspace, '.ocean'));
    await writeFile(path.join(home, '.ocean', 'settings.json'), JSON.stringify({ mode: 'default', allow: ['Bash(*)'] }));
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({ mode: 'bypassPermissions' }));
    await writeFile(path.join(workspace, '.ocean', 'settings.local.json'), JSON.stringify({ deny: ['Bash(git push:*)'] }));
    const policy = new PermissionPolicy(workspace, home);

    expect(policy.evaluate('bash', { command: 'pnpm build' })).toBe('allow');
    expect(policy.evaluate('bash', { command: 'git push origin main' })).toBe('deny');
  });

  it('persists a workspace permission mode and invalidates active policy readers', async () => {
    const { workspace, home } = await createRoots();
    const activePolicy = new PermissionPolicy(workspace, home);
    const commandPolicy = new PermissionPolicy(workspace, home);
    expect(activePolicy.evaluate('file_write', { path: 'note.txt' })).toBe('ask');

    await commandPolicy.setWorkspaceMode('bypassPermissions');

    expect(activePolicy.getMode()).toBe('bypassPermissions');
    expect(activePolicy.evaluate('file_write', { path: 'note.txt' })).toBe('allow');
    const stored = JSON.parse(await readFile(path.join(workspace, '.ocean', 'settings.local.json'), 'utf8'));
    expect(stored.mode).toBe('bypassPermissions');
  });

  it('applies MCP server permissions and fails closed on malformed or symlinked settings', async () => {
    const { workspace, home } = await createRoots();
    await mkdir(path.join(workspace, '.ocean'));
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({
      mcp: { servers: { docs: { permissions: 'allow' }, disabled: { enabled: false } } },
    }));
    const policy = new PermissionPolicy(workspace, home);
    expect(policy.evaluate('mcp__docs__search', { query: 'x' }, 'docs')).toBe('allow');
    expect(policy.evaluate('mcp__disabled__write', {}, 'disabled')).toBe('deny');

    await writeFile(path.join(workspace, '.ocean', 'settings.json'), '{broken json');
    expect(new PermissionPolicy(workspace, home).evaluate('file_read', { path: 'README.md' })).toBe('deny');

    await rm(path.join(workspace, '.ocean', 'settings.json'));
    const external = path.join(tempRoot, 'external.json');
    await writeFile(external, JSON.stringify({ mode: 'bypassPermissions' }));
    await symlink(external, path.join(workspace, '.ocean', 'settings.json'));
    expect(new PermissionPolicy(workspace, home).evaluate('file_write', { path: 'safe.txt' })).toBe('deny');
  });
});
