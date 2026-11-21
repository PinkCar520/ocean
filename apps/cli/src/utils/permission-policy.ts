import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  evaluateTool,
  evaluatePermissionDecision,
  parsePermissionSettings,
  getManagedPermissionPaths,
  normalizeRules,
  uniquePermissionRuleIds,
  type PermissionAction,
  type PermissionDecision,
  type PermissionSettings,
  type PermissionMode,
} from '@ocean/core/permission-policy';
import { SessionPermissionGrants } from '@ocean/core/session-permission-grants';
import { atomicWriteFile, withProcessFileLock } from './file-system.js';

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
  sessionMode?: PermissionMode;
  policyVersion: string;
}

/** Loads the same workspace policy format used by Gateway for local CLI tools. */
export class PermissionPolicy {
  private static revision = 0;
  private cached?: ResolvedPolicy;

  constructor(
    private readonly workspacePath: string,
    private readonly homePath: string = os.homedir(),
    private readonly options: {
      grants?: SessionPermissionGrants;
      mode?: PermissionMode | (() => PermissionMode | undefined);
      settings?: { value: PermissionSettings; root: string };
      sources?: ReadonlySet<'user' | 'project' | 'local'>;
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
    const sessionGrant = !policy.settings.allowManagedPermissionRulesOnly
      && (this.options.grants?.allows(sessionId, toolName, args) ?? false);
    return evaluatePermissionDecision(toolName, policy.settings, policy.rules, args, mcpServer, {
      sessionGrant,
      policyVersion: policy.policyVersion,
    });
  }

  /** Grant one exact tool call for this session; deny rules still win. */
  grantSession(toolName: string, args: Record<string, unknown> = {}, ttlMs?: number): void {
    const sessionId = typeof this.options.sessionId === 'function' ? this.options.sessionId() : this.options.sessionId;
    if (!this.options.grants || !sessionId) throw new Error('Session permission grants are not configured for this policy.');
    if (this.load().settings.allowManagedPermissionRulesOnly) {
      throw new Error('Managed settings only allow managed permission rules.');
    }
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

  /** Current policy fingerprint; changes whenever settings files or mode drift. */
  getPolicyVersion(): string {
    return this.load().policyVersion;
  }

  async setWorkspaceMode(mode: PermissionMode): Promise<void> {
    await this.updateSettings('localSettings', settings => ({ ...settings, mode }));
  }

  async applyHookUpdates(updates: readonly unknown[], signal?: AbortSignal): Promise<void> {
    if (this.load().settings.allowManagedPermissionRulesOnly) throw new Error('Permission updates are disabled by managed settings.');
    // Validate the entire batch before changing any files.
    const changes = updates.map(parseHookUpdate);
    const destinations = new Set(changes.map(change => change.destination));
    for (const destination of destinations) {
      const matching = changes.filter(change => change.destination === destination);
      await this.updateSettings(destination, settings => {
        signal?.throwIfAborted();
        return matching.reduce((current, change) => change.apply(current), settings);
      }, signal);
    }
  }

  private async updateSettings(
    destination: SettingsDestination,
    update: (settings: PermissionSettings) => PermissionSettings,
    signal?: AbortSignal,
  ): Promise<void> {
    const root = fs.realpathSync(destination === 'userSettings' ? this.homePath : this.workspacePath);
    const configDir = path.join(root, '.ocean');
    try {
      fs.mkdirSync(configDir, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const verifyDirectory = () => {
      const info = fs.lstatSync(configDir);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Ocean settings directory is unsafe.');
    };
    verifyDirectory();
    const filePath = path.join(configDir, destination === 'localSettings' ? 'settings.local.json' : 'settings.json');
    await withProcessFileLock(filePath, async () => {
      verifyDirectory();
      const current = this.readSettings(root, filePath);
      if (current === 'invalid') throw new Error('Permission settings are invalid or unsafe.');
      const updated = update(current ?? {});
      const serialized = JSON.stringify(updated, null, 2) + '\n';
      if (Buffer.byteLength(serialized) > MAX_SETTINGS_BYTES) throw new Error('Permission settings exceed the size limit.');
      await atomicWriteFile(filePath, serialized, {
        defaultMode: 0o600,
        beforeCommit: async () => {
          signal?.throwIfAborted();
          verifyDirectory();
        },
      });
    });

    PermissionPolicy.revision++;
    this.cached = undefined;
  }

  private load(): ResolvedPolicy {
    const now = Date.now();
    const sessionMode = typeof this.options.mode === 'function' ? this.options.mode() : this.options.mode;
    const revision = PermissionPolicy.revision;
    if (this.cached && this.cached.revision === revision && this.cached.sessionMode === sessionMode && now - this.cached.loadedAt < CACHE_TTL_MS) return this.cached;

    let workspaceRoot: string;
    let homeRoot: string;
    try {
      workspaceRoot = fs.realpathSync(this.workspacePath);
      homeRoot = fs.realpathSync(this.homePath);
    } catch {
      return this.cacheInvalid(now);
    }
    const paths = [
      { source: 'user' as const, root: homeRoot, file: path.join(homeRoot, '.claude', 'settings.json') },
      { source: 'user' as const, root: homeRoot, file: path.join(homeRoot, '.ocean', 'settings.json') },
      { source: 'project' as const, root: workspaceRoot, file: path.join(workspaceRoot, '.claude', 'settings.json') },
      { source: 'project' as const, root: workspaceRoot, file: path.join(workspaceRoot, '.ocean', 'settings.json') },
      { source: 'local' as const, root: workspaceRoot, file: path.join(workspaceRoot, '.claude', 'settings.local.json') },
      { source: 'local' as const, root: workspaceRoot, file: path.join(workspaceRoot, '.ocean', 'settings.local.json') },
    ].filter(({ source }) => !this.options.sources || this.options.sources.has(source));
    const managedSource = getManagedPermissionPaths();
    if (managedSource.invalid) return this.cacheInvalid(now);
    const managedPaths = managedSource.files.map((file) => ({ root: path.parse(file).root, file }));
    const managedLayers: Array<{ settings: PermissionSettings; sourceRoot: string }> = [];
    for (const { root, file } of managedPaths) {
      const value = this.readSettings(root, file);
      if (value === 'invalid' || (managedSource.required && !value)) return this.cacheInvalid(now);
      if (value) managedLayers.push({ settings: value, sourceRoot: workspaceRoot });
    }
    const managed = Object.assign({}, ...managedLayers.map(layer => layer.settings)) as PermissionSettings;

    const layers: typeof managedLayers = [];
    let invalid = false;

    for (const { source, root, file } of paths) {
      const value = this.readSettings(root, file);
      if (value === 'invalid') {
        invalid = true;
        break;
      }
      if (value) layers.push({ settings: value, sourceRoot: source === 'user' ? path.dirname(file) : root });
    }

    const commandSettings = this.options.settings;
    if (commandSettings) layers.push({ settings: commandSettings.value, sourceRoot: commandSettings.root });
    layers.push(...managedLayers);
    let settings: PermissionSettings = { ...DEFAULT_SETTINGS };
    for (const { settings: layer } of layers) {
      settings = {
        ...settings,
        ...layer,
        mcp: {
          servers: { ...(settings.mcp?.servers ?? {}), ...(layer.mcp?.servers ?? {}) },
        },
      };
    }
    settings.mode = managed.mode ?? sessionMode ?? settings.mode;
    settings.allowManagedPermissionRulesOnly = managed.allowManagedPermissionRulesOnly === true;
    if (invalid) {
      settings = {
        mode: 'default',
        rules: [{ action: 'deny', pattern: '*', comment: 'Invalid settings file; repair it before running tools.' }],
      };
    }

    this.cached = {
      settings,
      rules: uniquePermissionRuleIds((managed.allowManagedPermissionRulesOnly ? managedLayers : layers).slice().reverse().flatMap(({ settings: layer, sourceRoot }) => normalizeRules(layer, { settingsRoot: sourceRoot, workspaceRoot, homeRoot }))),
      invalid,
      loadedAt: now,
      revision,
      sessionMode,
      policyVersion: invalid ? 'invalid' : this.computePolicyVersion([...paths, ...managedPaths], sessionMode),
    };
    return this.cached;
  }

  /** Hash the exact files loaded so policy changes invalidate old approvals. */
  private computePolicyVersion(paths: Array<{ root: string; file: string }>, sessionMode?: PermissionMode): string {
    const hash = createHash('sha256');
    if (sessionMode) hash.update(`session-mode\0${sessionMode}\0`);
    if (this.options.settings) hash.update(JSON.stringify(this.options.settings));
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
      revision: PermissionPolicy.revision,
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
      return parsePermissionSettings(parsed) ?? 'invalid';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return 'invalid';
    }
  }
}

type SettingsDestination = 'userSettings' | 'projectSettings' | 'localSettings';

function parseHookUpdate(value: unknown): {
  destination: SettingsDestination;
  apply: (settings: PermissionSettings) => PermissionSettings;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid hook permission update.');
  const { destination, behavior, type, rules, mode } = value as Record<string, unknown>;
  if (destination !== 'userSettings' && destination !== 'projectSettings' && destination !== 'localSettings') {
    throw new Error('Unsupported hook permission update destination.');
  }
  if (type === 'setMode') {
    const parsed = parsePermissionSettings({ mode });
    if (!parsed?.mode) throw new Error('Invalid hook permission mode.');
    return { destination, apply: settings => ({ ...settings, mode: parsed.mode }) };
  }
  if ((type !== 'addRules' && type !== 'replaceRules' && type !== 'removeRules')
    || (behavior !== 'allow' && behavior !== 'deny' && behavior !== 'ask') || !Array.isArray(rules)) {
    throw new Error('Unsupported hook permission update.');
  }
  const patterns = rules.map(rule => {
    if (!rule || typeof rule.toolName !== 'string' || !rule.toolName.trim()
      || (rule.ruleContent !== undefined && typeof rule.ruleContent !== 'string')) {
      throw new Error('Invalid hook permission rule.');
    }
    return rule.ruleContent ? `${rule.toolName}(${rule.ruleContent})` : rule.toolName;
  });
  if (!parsePermissionSettings({ [behavior]: patterns })) throw new Error('Invalid hook permission rule.');
  return {
    destination,
    apply: settings => {
      if (type === 'addRules') {
        return { ...settings, [behavior]: [...new Set([...(settings[behavior] ?? []), ...patterns])] };
      }
      const keep = (pattern: string) => type === 'removeRules' && !patterns.includes(pattern);
      return {
        ...settings,
        [behavior]: type === 'replaceRules' ? [...new Set(patterns)] : settings[behavior]?.filter(keep),
        ...(settings.rules && { rules: settings.rules.filter(rule => rule.action !== behavior || keep(rule.pattern)) }),
        ...(settings.permissions && { permissions: { ...settings.permissions, [behavior]: settings.permissions[behavior]?.filter(keep) } }),
      };
    },
  };
}
