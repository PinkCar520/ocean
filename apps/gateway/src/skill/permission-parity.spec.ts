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
  it.each([
    [{}, 'unknown', 'ask'],
    [{}, 'local_bash', 'ask'],
    [{}, 'file_read', 'allow'],
    [{ mode: 'plan' }, 'file_write', 'deny'],
    [{ mode: 'dontAsk' }, 'unknown', 'deny'],
    [{ allow: ['*'], deny: ['*'] }, 'file_read', 'deny'],
    [{ allow: ['unknown'] }, 'unknown', 'allow'],
    [{ ask: ['mcp__docs__write'], mcp: { servers: { docs: { permissions: 'allow' } } } }, 'mcp__docs__write', 'ask'],
    [{ mcp: { servers: { docs: { enabled: false } } } }, 'mcp__docs__read', 'deny'],
  ] as [PermissionSettings, string, string][])('matches for %j / %s', (settings, name, expected) => {
    fs.writeFileSync(path.join(root, '.ocean/settings.json'), JSON.stringify(settings));
    expect(new PermissionPolicy(root, root).evaluate(name, {})).toBe(expected);
    expect(new PermissionService().evaluateTool(name, root, {})).toBe(expected);
    expect(evaluatePermission(name, settings, normalizeRules(settings), {})).toBe(expected);
  });
});
