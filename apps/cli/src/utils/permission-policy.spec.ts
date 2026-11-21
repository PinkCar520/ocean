import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionPolicy } from './permission-policy.js';
import { SessionPermissionGrants } from '@ocean/core';

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

  it('returns reason, ruleId and a stable policyVersion for decisions', async () => {
    const { workspace, home } = await createRoots();
    await mkdir(path.join(workspace, '.ocean'));
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({
      mode: 'default', allow: ['Bash(*)'], deny: ['Bash(rm:*)'],
    }));
    const policy = new PermissionPolicy(workspace, home);
    const denied = policy.evaluateDecision('bash', { command: 'rm -rf build' });
    expect(denied).toMatchObject({ action: 'deny', source: 'deny-rule' });
    expect(denied.ruleId).toBe('rule:deny:Bash(rm:*)');
    expect(denied.reason).toContain('Bash(rm:*)');
    expect(denied.policyVersion).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(policy.evaluateDecision('file_write', { path: 'a.txt' }).reason).toContain('requires approval');
    expect(policy.evaluateDecision('file_write', { path: 'a.txt' }).policyVersion).toBe(denied.policyVersion);
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({
      mode: 'default', allow: ['Bash(*)'], deny: ['Bash(rm:*)', 'Bash(dd:*)'],
    }));
    const changed = new PermissionPolicy(workspace, home).evaluateDecision('file_write', { path: 'a.txt' });
    expect(changed.policyVersion).not.toBe(denied.policyVersion);
  });

  it('persists hook rules atomically and invalidates other active policy instances', async () => {
    const { workspace, home } = await createRoots();
    const reader = new PermissionPolicy(workspace, home);
    const writer = new PermissionPolicy(workspace, home);
    expect(reader.evaluate('file_write', { path: 'notes.md' })).toBe('ask');
    await writer.applyHookUpdates([{
      type: 'addRules', destination: 'localSettings', behavior: 'allow', rules: [{ toolName: 'file_write' }],
    }]);
    expect(reader.evaluate('file_write', { path: 'notes.md' })).toBe('allow');
    await writer.applyHookUpdates([{
      type: 'removeRules', destination: 'localSettings', behavior: 'allow', rules: [{ toolName: 'file_write' }],
    }]);
    expect(reader.evaluate('file_write', { path: 'notes.md' })).toBe('ask');
    await expect(writer.applyHookUpdates([
      { type: 'setMode', destination: 'localSettings', mode: 'acceptEdits' },
      { type: 'addDirectories', destination: 'session', directories: ['/tmp'] },
    ])).rejects.toThrow('Unsupported hook permission update');
    expect(reader.getMode()).toBe('default');
  });

  it('applies exact session grants after deny checks and scopes them to one session', async () => {
    const { workspace, home } = await createRoots();
    await mkdir(path.join(workspace, '.ocean'));
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({ mode: 'default', deny: ['Edit(secrets/**)'] }));
    const grants = new SessionPermissionGrants();
    const policy = new PermissionPolicy(workspace, home, { grants, sessionId: 'session-1' });
    expect(policy.evaluate('file_write', { path: 'notes.txt' })).toBe('ask');
    policy.grantSession('file_write', { path: 'notes.txt' });
    expect(policy.evaluate('file_write', { path: 'notes.txt' })).toBe('allow');
    expect(policy.evaluate('file_write', { path: 'other.txt' })).toBe('ask');
    expect(new PermissionPolicy(workspace, home, { grants, sessionId: 'session-2' }).evaluate('file_write', { path: 'notes.txt' })).toBe('ask');
    expect(policy.evaluate('file_edit', { path: 'secrets/token.txt' })).toBe('deny');
    policy.grantSession('file_edit', { path: 'secrets/token.txt' });
    expect(policy.evaluate('file_edit', { path: 'secrets/token.txt' })).toBe('deny');
    expect(policy.clearSessionGrants()).toBe(2);
  });

  it('expires session grants and rejects malformed grant identities', async () => {
    const grants = new SessionPermissionGrants();
    grants.grant('s', 'file_write', { path: 'a' }, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(grants.allows('s', 'file_write', { path: 'a' })).toBe(false);
    expect(() => grants.grant('', 'file_write', {})).toThrow('session id');
    expect(() => grants.grant('s', 'file_write', { nested: { a: 1, b: 2 } }, 1000)).not.toThrow();
    expect(grants.allows('s', 'file_write', { nested: { b: 2, a: 1 } })).toBe(true);
  });

  it('does not let MCP server allow override tool ask or deny', async () => {
    const { workspace, home } = await createRoots();
    await mkdir(path.join(workspace, '.ocean'));
    await writeFile(path.join(workspace, '.ocean', 'settings.json'), JSON.stringify({
      ask: ['mcp__docs__write'], deny: ['mcp__docs__delete'],
      mcp: { servers: { docs: { permissions: 'allow' } } },
    }));
    const policy = new PermissionPolicy(workspace, home);
    expect(policy.evaluate('mcp__docs__write', {}, 'docs')).toBe('ask');
    expect(policy.evaluate('mcp__docs__delete', {}, 'docs')).toBe('deny');
  });

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


describe('shell syntax and rule identities', () => {
 it('distinguishes quoted paths from shell operators and rejects path traversal', async () => {
  const { isReadOnlyTool, normalizeRules } = await import('@ocean/core');
  expect(isReadOnlyTool('local_bash', { command: `ls 'folder with spaces'` })).toBe(true);
  expect(isReadOnlyTool('local_bash', { command: `ls '../outside path'` })).toBe(false);
  expect(isReadOnlyTool('local_bash', { command: 'pwd unexpected' })).toBe(false);
  expect(isReadOnlyTool('local_bash', { command: 'ls $(touch bad)' })).toBe(false);
  const rules = normalizeRules({ allow: ['ls', 'ls', 'ls#2', 'ls'] });
  expect(new Set(rules.map(rule => rule.id)).size).toBe(4);
 });
});
