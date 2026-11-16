import {
  evaluateTool,
  isReadOnlyTool,
  normalizeRules,
  NormalizedRule,
  wildcardToRegex,
} from './permission.types';
import { PermissionService } from './permission.service';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('unified decision contract', () => {
  it.each([
    ['unknown', {}, 'default', [], 'ask'],
    ['local_bash', { command: 'rm -rf build' }, 'default', [], 'ask'],
    ['local_file_read', {}, 'default', [], 'allow'],
    ['local_file_edit', {}, 'plan', [], 'deny'],
    ['unknown', {}, 'dontAsk', [], 'deny'],
    ['local_bash', {}, 'bypassPermissions', [{ action: 'deny', pattern: '*' }], 'deny'],
    ['unknown', {}, 'default', [{ action: 'allow', pattern: '*' }, { action: 'deny', pattern: '*' }], 'deny'],
  ] as const)('%s follows shared policy', (name, args, mode, rules, expected) => {
    expect(evaluateTool(name, normalizeRules({ rules: [...rules] }), args, mode)).toBe(expected);
  });
});

describe('Permission Logic (Claude Code Style)', () => {
  describe('isReadOnlyTool', () => {
    it('should allow basic read-only tools', () => {
      expect(isReadOnlyTool('local_file_read')).toBe(true);
      expect(isReadOnlyTool('grep')).toBe(true);
      expect(isReadOnlyTool('mcp__zentao:getBugInfo')).toBe(true);
    });

    it('should allow safe git actions', () => {
      expect(isReadOnlyTool('local_git', { action: 'status' })).toBe(true);
      expect(isReadOnlyTool('local_git', { action: 'diff' })).toBe(true);
      expect(isReadOnlyTool('local_git', { action: 'worktree_list' })).toBe(true);
      expect(isReadOnlyTool('local_git', { action: 'worktree_add' })).toBe(false);
      expect(isReadOnlyTool('local_git', { action: 'commit' })).toBe(false);
    });

    it('should allow safe bash commands', () => {
      expect(isReadOnlyTool('local_bash', { command: 'ls -la' })).toBe(true);
      expect(isReadOnlyTool('local_bash', { command: 'pwd' })).toBe(true);
      expect(isReadOnlyTool('local_bash', { command: 'git status' })).toBe(
        true,
      );
    });

    it('must ask before running PowerShell even for a read-looking command', () => {
      expect(isReadOnlyTool('local_powershell', { command: 'Get-ChildItem' })).toBe(false);
    });

    it('should block dangerous bash commands even if they start with safe prefix', () => {
      expect(isReadOnlyTool('local_bash', { command: 'ls; rm -rf /' })).toBe(
        false,
      );
      expect(
        isReadOnlyTool('local_bash', { command: 'cat /etc/passwd > /tmp/out' }),
      ).toBe(false);
      expect(isReadOnlyTool('local_bash', { command: 'ls | wall' })).toBe(
        false,
      );
      expect(isReadOnlyTool('local_bash', { command: 'lsanything' })).toBe(false);
      expect(isReadOnlyTool('local_bash', { command: 'ls /etc' })).toBe(false);
      expect(isReadOnlyTool('local_bash', { command: 'git status-fake' })).toBe(false);
      expect(isReadOnlyTool('local_bash', { command: 'git diff --output=/tmp/out' })).toBe(false);
      expect(isReadOnlyTool('local_bash', { command: 'cat /etc/passwd' })).toBe(false);
    });
  });

  describe('evaluateTool', () => {
    const emptyRules: NormalizedRule[] = [];

    it('should auto-allow read-only tools when no rules match', () => {
      expect(evaluateTool('local_file_read', emptyRules)).toBe('allow');
      expect(evaluateTool('local_git', emptyRules, { action: 'worktree_list' })).toBe('allow');
      expect(evaluateTool('local_git', emptyRules, { action: 'worktree_remove' })).toBe('ask');
    });

    it('should fallback to ask for unknown tools', () => {
      expect(evaluateTool('unknown_tool', emptyRules)).toBe('ask');
      expect(evaluateTool('local_powershell', emptyRules, { command: 'Get-ChildItem' })).toBe('ask');
    });

    it('should respect explicit deny rules over smart defaults', () => {
      const rules: NormalizedRule[] = [
        {
          action: 'deny',
          pattern: 'local_file_read',
          regex: wildcardToRegex('local_file_read'),
        },
      ];
      expect(evaluateTool('local_file_read', rules)).toBe('deny');
    });

    it('gives any matching deny precedence over allow and bypass modes', () => {
      const rules: NormalizedRule[] = [
        { action: 'allow', pattern: 'local_bash', regex: wildcardToRegex('local_bash') },
        { action: 'deny', pattern: '*', regex: wildcardToRegex('*') },
      ];
      expect(evaluateTool('local_bash', rules, { command: 'pwd' }, 'bypassPermissions')).toBe('deny');
    });

    it('keeps matching ask rules ahead of broad allow and bypass modes', () => {
      const rules = normalizeRules({ allow: ['Bash(*)'], ask: ['Bash(git push:*)'] });
      expect(evaluateTool('local_bash', rules, { command: 'git push origin main' })).toBe('ask');
      expect(evaluateTool('local_bash', rules, { command: 'git push origin main' }, 'bypassPermissions')).toBe('ask');
    });

    it('applies plan and accept-edits modes without weakening explicit rules', () => {
      expect(evaluateTool('local_file_edit', [], {}, 'acceptEdits')).toBe('allow');
      expect(evaluateTool('local_bash', [], { command: 'rm -rf build' }, 'acceptEdits')).toBe('ask');
      expect(evaluateTool('local_bash', [], { command: 'pwd' }, 'plan')).toBe('allow');
      expect(evaluateTool('local_bash', [], { command: 'rm -rf build' }, 'plan')).toBe('deny');
      expect(evaluateTool('local_file_edit', [], {}, 'plan')).toBe('deny');
      expect(evaluateTool('local_file_read', [], {}, 'plan')).toBe('allow');
      expect(evaluateTool('local_file_edit', [], {}, 'dontAsk')).toBe('deny');
      expect(evaluateTool('local_file_read', [], {}, 'dontAsk')).toBe('allow');
    });

    it('matches tool-specific command and path rules against structured arguments', () => {
      const rules = normalizeRules({
        allow: ['Bash(git:*)', 'Edit(src/**)'],
        deny: ['Bash(rm*)'],
      });
      expect(evaluateTool('local_bash', rules, { command: 'git status --short' })).toBe('allow');
      expect(evaluateTool('local_bash', rules, { command: 'rm -rf build' })).toBe('deny');
      expect(evaluateTool('local_file_edit', rules, { path: 'src/app.ts' })).toBe('allow');
      expect(evaluateTool('local_file_edit', rules, { path: 'secrets/app.ts' })).toBe('ask');
    });

    it('matches shell prefix, escaped wildcard, optional arguments, and PowerShell case insensitively', () => {
      const rules = normalizeRules({ allow: [
        'Bash(git *)',
        String.raw`Bash(echo \*)`,
        'PowerShell(Get-ChildItem *)',
      ] });
      expect(evaluateTool('local_bash', rules, { command: 'git' })).toBe('allow');
      expect(evaluateTool('local_bash', rules, { command: 'git status' })).toBe('allow');
      expect(evaluateTool('local_bash', rules, { command: 'echo *' })).toBe('allow');
      expect(evaluateTool('local_bash', rules, { command: 'echo hello' })).toBe('ask');
      expect(evaluateTool('local_powershell', rules, { command: 'get-childitem' })).toBe('allow');
    });

    it('should handle bash arguments in evaluation', () => {
      expect(evaluateTool('local_bash', emptyRules, { command: 'ls' })).toBe(
        'allow',
      );
      expect(
        evaluateTool('local_bash', emptyRules, { command: 'rm -rf' }),
      ).toBe('ask');
    });
  });

  describe('PermissionService settings', () => {
    let root: string;
    let originalHome: string | undefined;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-permission-settings-'));
      originalHome = process.env.HOME;
      process.env.HOME = path.join(root, 'home');
      fs.mkdirSync(path.join(process.env.HOME, '.ocean'), { recursive: true });
    });

    afterEach(() => {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(root, { recursive: true, force: true });
    });

    function save(filePath: string, value: unknown) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(value));
    }

    it('merges user/project/local settings by source priority and keeps deny global', () => {
      const workspace = path.join(root, 'workspace');
      save(path.join(process.env.HOME!, '.ocean', 'settings.json'), {
        mode: 'bypassPermissions', allow: ['local_git'],
      });
      save(path.join(workspace, '.claude', 'settings.json'), {
        mode: 'default', ask: ['local_bash', 'local_plan'],
      });
      save(path.join(workspace, '.ocean', 'settings.json'), {
        allow: ['local_plan'],
      });
      save(path.join(workspace, '.claude', 'settings.local.json'), {
        mode: 'acceptEdits', rules: [{ action: 'ask', pattern: 'local_file_edit' }],
        deny: ['local_git'],
      });

      const service = new PermissionService();
      expect(service.getMode(workspace)).toBe('acceptEdits');
      expect(service.evaluateTool('local_file_edit', workspace)).toBe('ask');
      expect(service.evaluateTool('local_bash', workspace, { command: 'pwd' })).toBe('ask');
      expect(service.evaluateTool('local_plan', workspace)).toBe('allow');
      expect(service.evaluateTool('local_git', workspace, { action: 'status' })).toBe('deny');
    });

    it('fails closed when a policy file is invalid', () => {
      const workspace = path.join(root, 'workspace');
      const settingsPath = path.join(workspace, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, '{ invalid json');

      const service = new PermissionService();
      expect(service.evaluateTool('local_file_read', workspace)).toBe('deny');
      expect(service.isAutoAllowed('local_file_read', workspace)).toBe(false);
    });
  });
});
