import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Runtime loading keeps the CLI fixture outside Gateway's composite build graph.
const { PermissionPolicy } = require('../../../cli/src/utils/permission-policy');
import { PermissionService } from './permission.service';
import { evaluatePermission, normalizeRules, PermissionSettings } from '@ocean/core';

describe('CLI/Gateway permission parity (Worker uses PermissionService)', () => {
  let root: string;
  let previousHome: string | undefined;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-parity-'));
    previousHome = process.env.HOME;
    process.env.HOME = root;
    fs.mkdirSync(path.join(root, '.ocean'));
  });
  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('loads nested permission mode and rules on both execution paths', () => {
    fs.writeFileSync(path.join(root, '.ocean/settings.json'), JSON.stringify({
      permissions: { defaultMode: 'dontAsk', allow: ['file_write'], ask: ['file_edit'], deny: ['file_read'] },
    }));
    const cli = new PermissionPolicy(root, root);
    const gateway = new PermissionService(root);
    expect(cli.getMode()).toBe('dontAsk');
    expect(gateway.getMode(root)).toBe('dontAsk');
    expect(gateway.getRules(root)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'ask', pattern: 'file_edit' }),
    ]));
    for (const [tool, expected] of [
      ['file_write', 'allow'], ['file_edit', 'deny'], ['file_read', 'deny'], ['unknown', 'deny'],
    ]) {
      expect(cli.evaluate(tool, {})).toBe(expected);
      expect(gateway.evaluateTool(tool, root, {})).toBe(expected);
    }
  });
  it('applies an explicit ask before allow across settings sources', () => {
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(path.join(workspace, '.ocean'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ocean/settings.json'), JSON.stringify({
      permissions: { ask: ['file_write'] },
    }));
    fs.writeFileSync(path.join(workspace, '.ocean/settings.json'), JSON.stringify({
      permissions: { allow: ['file_write'] },
    }));

    expect(new PermissionPolicy(workspace, root).evaluate('file_write', {})).toBe('ask');
    expect(new PermissionService(root).evaluateTool('file_write', workspace, {})).toBe('ask');
  });
  it('resolves gitignore-style path rules against the workspace and keeps literal boundaries', () => {
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(path.join(workspace, '.ocean'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.ocean/settings.json'), JSON.stringify({
      permissions: { deny: ['Read(/private/**)', 'Read(.env)'], allow: ['Edit(/src/core)'] },
    }));
    const cli = new PermissionPolicy(workspace, root);
    const gateway = new PermissionService(root);
    for (const [tool, input, expected] of [
      ['file_read', 'private/config.txt', 'deny'],
      ['file_read', 'nested/.env', 'deny'],
      ['file_read', 'nested/private/config.txt', 'allow'],
      ['file_edit', 'src/core/module.ts', 'allow'],
      ['file_edit', 'src/core-extra/module.ts', 'ask'],
    ]) {
      expect(cli.evaluate(tool, { path: input })).toBe(expected);
      expect(gateway.evaluateTool(tool, workspace, { path: input })).toBe(expected);
    }
  });

  it('uses only administrator permission rules when managed settings require it', () => {
    const configured = process.env.OCEAN_MANAGED_SETTINGS_PATH;
    const file = path.join(fs.realpathSync(root), 'admin.json');
    fs.writeFileSync(file, JSON.stringify({
      allowManagedPermissionRulesOnly: true,
      permissions: { allow: ['file_write'], deny: ['file_read'] },
    }));
    fs.writeFileSync(path.join(root, '.ocean/settings.json'), JSON.stringify({
      permissions: { deny: ['file_write'], allow: ['file_read'] },
    }));
    process.env.OCEAN_MANAGED_SETTINGS_PATH = file;
    try {
      const cli = new PermissionPolicy(root, root);
      const gateway = new PermissionService(root);
      expect(cli.evaluate('file_write', {})).toBe('allow');
      expect(cli.evaluate('file_read', {})).toBe('deny');
      expect(gateway.evaluateTool('file_write', root, {})).toBe('allow');
      expect(gateway.evaluateTool('file_read', root, {})).toBe('deny');
    } finally {
      if (configured === undefined) delete process.env.OCEAN_MANAGED_SETTINGS_PATH;
      else process.env.OCEAN_MANAGED_SETTINGS_PATH = configured;
    }
  });

  it.each([
    [{}, 'unknown', 'ask'],
    [{}, 'local_bash', 'ask'],
    [{}, 'file_read', 'allow'],
    [{ mode: 'plan' }, 'file_write', 'deny'],
    [{ mode: 'dontAsk' }, 'unknown', 'deny'],
    [{ allow: ['*'], deny: ['*'] }, 'file_read', 'deny'],
    [{ allow: ['unknown'] }, 'unknown', 'allow'],
    [{ deny: ['mcp__docs_internal'] }, 'mcp__docs_internal__read', 'deny'],
    [{ deny: ['mcp__docs_internal'] }, 'mcp__docs_internal:read', 'deny'],
    [{ allow: ['mcp__docs_internal__read'] }, 'mcp__docs_internal:read', 'allow'],
    [{ ask: ['mcp__docs_internal__*'] }, 'mcp__docs_internal:read', 'ask'],
    [{ ask: ['mcp__docs__write'], mcp: { servers: { docs: { permissions: 'allow' } } } }, 'mcp__docs__write', 'ask'],
    [{ mcp: { servers: { docs_internal: { enabled: false } } } }, 'mcp__docs_internal__read', 'deny'],
    [{ mcp: { servers: { docs_internal: { enabled: false } } } }, 'mcp__docs_internal:read', 'deny'],
    [{ mcp: { servers: { docs: { enabled: true }, docs__internal: { enabled: false } } } }, 'mcp__docs__internal__read', 'deny'],
    [{ mcp: { servers: { docs: { enabled: false } } } }, 'mcp__docs__read', 'deny'],
  ] as [PermissionSettings, string, string][])('matches for %j / %s', (settings, name, expected) => {
    fs.writeFileSync(path.join(root, '.ocean/settings.json'), JSON.stringify(settings));
    expect(new PermissionPolicy(root, root).evaluate(name, {})).toBe(expected);
    expect(new PermissionService().evaluateTool(name, root, {})).toBe(expected);
    expect(evaluatePermission(name, settings, normalizeRules(settings), {})).toBe(expected);
  });
});
