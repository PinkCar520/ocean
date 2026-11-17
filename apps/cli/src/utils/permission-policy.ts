import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  evaluateTool,
  evaluatePermissionDecision,
  isPermissionSettings,
  normalizeRules,
  uniquePermissionRuleIds,
  SessionPermissionGrants,
  type PermissionAction,
  type PermissionDecision,
  type PermissionSettings,
  type PermissionMode,
} from '@ocean/core';
import { atomicWriteFile } from './file-system.js';

const DEFAULT_SETTINGS: PermissionSettings = { mode: 'default' };

/** Shared by every PermissionPolicy instance in one CLI process; keys are session ids. */
export const defaultSessionPermissionGrants = new SessionPermissionGrants();
const MAX_SETTINGS_BYTES = 256 * 1024;
const CACHE_TTL_MS = 1_000;

interface ResolvedPolicy {
  settings: PermissionSettings;
  rules: ReturnType<typeof normalizeRules>;
  invalid: boolean;
  loadedAt: number;
  revision: number;
  policyVersion: string;
}

/** Loads the same workspace policy format used by Gateway for local CLI tools. */
export class PermissionPolicy {
  private static readonly revisions = new Map<string, number>();
  private cached?: ResolvedPolicy;

  constructor(
    private readonly workspacePath: string,
    private readonly homePath: string = os.homedir(),
    private readonly options: {
      grants?: SessionPermissionGrants;
      sessionId?: string | (() => string | undefined);
    } = {},
  ) {}

  evaluate(toolName: string, args?: Record<string, unknown>, mcpServer?: string): PermissionAction {
    return this.evaluateDecision(toolName, args, mcpServer).action;
  }

  /** Full decision with reason/ruleId/policyVersion and session-grant accounting. */
  evaluateDecision(toolName: string, args?: Record<string, unknown>, mcpServer?: string): PermissionDecision {
    const policy = this.load();
    if (policy.invalid) {
      return {
        action: 'deny',
        reason: 'Invalid or unsafe permission settings; denying by default.',
        policyVersion: 'invalid',
        source: 'invalid',
      };
    }
    const sessionId = typeof this.options.sessionId === 'function'
      ? this.options.sessionId()
      : this.options.sessionId;
    const sessionGrant = this.options.grants?.allows(sessionId, toolName, args) ?? false;
    return evaluatePermissionDecision(toolName, policy.settings, policy.rules, args, mcpServer, {
      sessionGrant,
      policyVersion: policy.policyVersion,
    });
  }

  /** Grant one exact tool call for this session; deny rules still win. */
  grantSession(toolName: string, args: Record<string, unknown> = {}, ttlMs?: number): void {
    const sessionId = typeof this.options.sessionId === 'function' ? this.options.sessionId() : this.options.sessionId;
    if (!this.options.grants || !sessionId) throw new Error('Session permission grants are not configured for this policy.');
    this.options.grants.grant(sessionId, toolName, args, ttlMs);
  }

  clearSessionGrants(): number {
    const sessionId = typeof this.options.sessionId === 'function' ? this.options.sessionId() : this.options.sessionId;
    if (!this.options.grants || !sessionId) return 0;
    return this.options.grants.clearSession(sessionId);
  }

  requiresApproval(toolName: string, args?: Record<string, unknown>, options: { alwaysAskInBypass?: boolean } = {}): boolean {
    const policy = this.load();
    const action = this.evaluate(toolName, args);
    if (action === 'ask') return true;
    if (action === 'deny' || !options.alwaysAskInBypass || policy.settings.mode !== 'bypassPermissions') return false;
    // Preserve tool-level mandatory interaction unless an explicit allow rule
    // granted this exact tool/argument in the default policy path.
    return evaluateTool(toolName, policy.rules, args, 'default') === 'ask';
  }

  getMode(): PermissionMode {
    return this.load().settings.mode ?? 'default';
  }

  async setWorkspaceMode(mode: PermissionMode): Promise<void> {
    const root = fs.realpathSync(this.workspacePath);
    const configDir = path.join(root, '.ocean');
    try {
      const dirInfo = fs.lstatSync(configDir);
      if (dirInfo.isSymbolicLink() || !dirInfo.isDirectory()) throw new Error('Workspace .ocean settings directory is unsafe.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      fs.mkdirSync(configDir, { mode: 0o700 });
    }

    const filePath = path.join(configDir, 'settings.local.json');
    const current = this.readSettings(root, filePath);
    if (current === 'invalid') throw new Error('Workspace-local settings are invalid or unsafe; repair them before changing permission mode.');
    const updated: PermissionSettings = { ...(current ?? {}), mode };
    await atomicWriteFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, { defaultMode: 0o600 });

    const key = path.resolve(this.workspacePath);
    PermissionPolicy.revisions.set(key, (PermissionPolicy.revisions.get(key) ?? 0) + 1);
    this.cached = undefined;
  }

  private load(): ResolvedPolicy {
    const now = Date.now();
    const revision = PermissionPolicy.revisions.get(path.resolve(this.workspacePath)) ?? 0;
    if (this.cached && this.cached.revision === revision && now - this.cached.loadedAt < CACHE_TTL_MS) return this.cached;

    let workspaceRoot: string;
    let homeRoot: string;
    try {
      workspaceRoot = fs.realpathSync(this.workspacePath);
      homeRoot = fs.realpathSync(this.homePath);
    } catch {
      return this.cacheInvalid(now);
    }
    const paths = [
      { root: homeRoot, file: path.join(homeRoot, '.claude', 'settings.json') },
      { root: homeRoot, file: path.join(homeRoot, '.ocean', 'settings.json') },
      { root: workspaceRoot, file: path.join(workspaceRoot, '.claude', 'settings.json') },
      { root: workspaceRoot, file: path.join(workspaceRoot, '.ocean', 'settings.json') },
      { root: workspaceRoot, file: path.join(workspaceRoot, '.claude', 'settings.local.json') },
      { root: workspaceRoot, file: path.join(workspaceRoot, '.ocean', 'settings.local.json') },
    ];
    const layers: PermissionSettings[] = [];
    let invalid = false;

    for (const { root, file } of paths) {
      const value = this.readSettings(root, file);
      if (value === 'invalid') {
        invalid = true;
        break;
      }
      if (value) layers.push(value);
    }

    let settings: PermissionSettings = { ...DEFAULT_SETTINGS };
    for (const layer of layers) {
      settings = {
        ...settings,
        ...layer,
        mcp: {
          servers: { ...(settings.mcp?.servers ?? {}), ...(layer.mcp?.servers ?? {}) },
        },
      };
    }
    if (invalid) {
      settings = {
        mode: 'default',
        rules: [{ action: 'deny', pattern: '*', comment: 'Invalid settings file; repair it before running tools.' }],
      };
    }

    this.cached = {
      settings,
      rules: uniquePermissionRuleIds(layers.slice().reverse().flatMap((layer) => normalizeRules(layer))),
      invalid,
      loadedAt: now,
      revision,
      policyVersion: invalid ? 'invalid' : this.computePolicyVersion(paths, settings),
    };
    return this.cached;
  }

  /** Hash the exact files loaded so policy changes invalidate old approvals. */
  private computePolicyVersion(paths: Array<{ root: string; file: string }>, settings: PermissionSettings): string {
    if (settings.version) return settings.version;
    const hash = createHash('sha256');
    for (const { file } of [...paths].sort((a, b) => a.file.localeCompare(b.file))) {
      try {
        const info = fs.lstatSync(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SETTINGS_BYTES) {
          hash.update(`unsafe\0${file}\0`);
          continue;
        }
        hash.update(`${file}\0`);
        hash.update(fs.readFileSync(file));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') hash.update(`error\0${file}\0`);
      }
    }
    return `sha256-${hash.digest('hex')}`;
  }

  private cacheInvalid(now: number): ResolvedPolicy {
    this.cached = {
      settings: { mode: 'default', rules: [{ action: 'deny', pattern: '*' }] },
      rules: normalizeRules({ mode: 'default', rules: [{ action: 'deny', pattern: '*' }] }),
      invalid: true,
      loadedAt: now,
      revision: PermissionPolicy.revisions.get(path.resolve(this.workspacePath)) ?? 0,
      policyVersion: 'invalid',
    };
    return this.cached;
  }

  private readSettings(root: string, filePath: string): PermissionSettings | null | 'invalid' {
    try {
      const relativePath = path.relative(root, filePath);
      if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return 'invalid';
      let current = root;
      const segments = relativePath.split(path.sep);
      for (let index = 0; index < segments.length; index += 1) {
        current = path.join(current, segments[index]);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) return 'invalid';
        const isLast = index === segments.length - 1;
        if (isLast ? !stat.isFile() || stat.size > MAX_SETTINGS_BYTES : !stat.isDirectory()) return 'invalid';
      }
      const parsed: unknown = JSON.parse(fs.readFileSync(current, 'utf8'));
      return isPermissionSettings(parsed) ? parsed : 'invalid';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return 'invalid';
    }
  }
}
