import { getManagedPermissionPaths, parsePermissionSettings, uniquePermissionRuleIds, evaluatePermissionDecision, permissionPolicyVersion, type PermissionDecision } from '@ocean/core';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  PermissionSettings,
  PermissionAction,
  PermissionMode,
  NormalizedRule,
  normalizeRules,
  evaluateTool,
} from './permission.types';

/**
 * Default settings when no settings.json is found.
 * 与 CLI 一致使用 default：只读操作自动批准，写入和未知工具需要确认。
 */
const DEFAULT_SETTINGS: PermissionSettings = {
  mode: 'default',
  maxMcpOutputTokens: 25_000,
};

/**
 * PermissionService
 *
 * Loads and evaluates permission rules from settings.json files.
 * Supports user, workspace and workspace-local configuration layers.
 * Workspace-local rules override project and user rules; deny matches always win.
 *
 * Rules are evaluated top-down, first match wins.
 * Supports wildcard patterns: `mcp__zentao:*`, `Bash(git:*)`, `Edit(src/**)`
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(@Optional() @Inject('PERMISSION_USER_HOME') private readonly policyHome?: string) {}

  /** Cache is isolated per workspace so one project's policy cannot leak into another. */
  private readonly cache = new Map<
    string,
    { settings: PermissionSettings; rules: NormalizedRule[]; loadedAt: number; policyVersion: string }
  >();
  private readonly CACHE_TTL_MS = 5_000; // 5 second cache

  /**
   * Load and merge settings from all layers.
   * Returns merged settings with higher priority layers overriding lower ones.
   */
  loadSettings(workspacePath?: string): PermissionSettings {
    const now = Date.now();
    const cacheKey = workspacePath
      ? path.resolve(workspacePath)
      : '__default__';
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.loadedAt < this.CACHE_TTL_MS
      && cached.policyVersion === this.computePolicyVersion(workspacePath)) {
      return cached.settings;
    }

    const layers: Array<{ settings: PermissionSettings; sourceRoot: string }> = [];

    // User-level settings are the lowest-priority layer.
    const userHome = this.policyHome ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
    if (userHome) {
      for (const filePath of [
        path.join(userHome, '.claude', 'settings.json'),
        path.join(userHome, '.ocean', 'settings.json'),
      ]) {
        const userSettings = this.tryLoadJson(filePath);
        if (userSettings) {
          this.logger.debug(`Loaded user permission settings from ${filePath}`);
          layers.push({ settings: userSettings, sourceRoot: path.dirname(filePath) });
        }
      }
    }

    // Project-level settings are shared with the workspace.
    if (workspacePath) {
      for (const filePath of [
        path.join(workspacePath, '.claude', 'settings.json'),
        path.join(workspacePath, '.ocean', 'settings.json'),
      ]) {
        const projectSettings = this.tryLoadJson(filePath);
        if (projectSettings) {
          this.logger.debug(`Loaded project permission settings from ${filePath}`);
          layers.push({ settings: projectSettings, sourceRoot: workspacePath });
        }
      }
    }

    // Local overrides live inside the active workspace, never in the Gateway cwd.
    if (workspacePath) {
      for (const filePath of [
        path.join(workspacePath, '.claude', 'settings.local.json'),
        path.join(workspacePath, '.ocean', 'settings.local.json'),
      ]) {
        const localSettings = this.tryLoadJson(filePath);
        if (localSettings) {
          this.logger.debug(`Loaded workspace-local permission settings from ${filePath}`);
          layers.push({ settings: localSettings, sourceRoot: workspacePath });
        }
      }
    }

    const managedSource = getManagedPermissionPaths();
    const managedLayers: typeof layers = [];
    const managedRoot = workspacePath ?? process.cwd();
    for (const file of managedSource.files) {
      const value = this.tryLoadJson(file);
      if (value) managedLayers.push({ settings: value, sourceRoot: managedRoot });
      else if (managedSource.required) managedLayers.push({ settings: { rules: [{ action: 'deny', pattern: '*' }] }, sourceRoot: managedRoot });
    }
    if (managedSource.invalid) managedLayers.push({ settings: { rules: [{ action: 'deny', pattern: '*' }] }, sourceRoot: managedRoot });
    const managed = Object.assign({}, ...managedLayers.map(layer => layer.settings)) as PermissionSettings;
    layers.push(...managedLayers);

    // Merge layers (later overrides earlier)
    let merged: PermissionSettings = { ...DEFAULT_SETTINGS };
    for (const { settings: layer } of layers) {
      merged = this.mergeSettings(merged, layer);
    }

    merged.allowManagedPermissionRulesOnly = managed.allowManagedPermissionRulesOnly === true;

    // Keep source priority: workspace-local, project, then user. A matching deny
    // is checked across the entire set before any allow/ask rule is considered.
    const rules = uniquePermissionRuleIds((managed.allowManagedPermissionRulesOnly ? managedLayers : layers).slice().reverse().flatMap(({ settings: layer, sourceRoot }) => normalizeRules(layer, {
      settingsRoot: sourceRoot, workspaceRoot: workspacePath, homeRoot: userHome || undefined,
    })));
    this.cache.set(cacheKey, { settings: merged, rules, loadedAt: now, policyVersion: this.computePolicyVersion(workspacePath) });

    this.logger.log(
      `Permission settings loaded. Mode: ${merged.mode}, Rules: ${rules.length}`,
    );
    return merged;
  }

  /**
   * Evaluate a tool against loaded rules.
   * Returns the permission action for the tool.
   */
  evaluateTool(
    toolName: string,
    workspacePath?: string,
    args?: any,
    mcpServer?: string,
  ): PermissionAction {
    return this.evaluateToolDecision(toolName, workspacePath, args, mcpServer).action;
  }

  /** Full decision used by Worker audit/denial messages. */
  evaluateToolDecision(
    toolName: string,
    workspacePath?: string,
    args?: any,
    mcpServer?: string,
  ): PermissionDecision {
    const settings = this.loadSettings(workspacePath);
    const cacheKey = workspacePath ? path.resolve(workspacePath) : '__default__';
    const decision = evaluatePermissionDecision(toolName, settings, this.rulesFor(workspacePath), args, mcpServer, {
      policyVersion: this.cache.get(cacheKey)?.policyVersion,
    });
    return settings.allowManagedPermissionRulesOnly ? { ...decision, managedRulesOnly: true } : decision;
  }

  getPolicyVersion(workspacePath?: string): string {
    this.loadSettings(workspacePath);
    const cacheKey = workspacePath ? path.resolve(workspacePath) : '__default__';
    return this.cache.get(cacheKey)?.policyVersion ?? permissionPolicyVersion(this.loadSettings(workspacePath), this.rulesFor(workspacePath));
  }

  /** Fingerprint the exact policy files so approvals pin what the user saw. */
  private computePolicyVersion(workspacePath: string | undefined): string {
    const userHome = this.policyHome ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
    const managedSource = getManagedPermissionPaths();
    const files = [
      ...managedSource.files,
      ...(userHome ? [path.join(userHome, '.claude', 'settings.json'), path.join(userHome, '.ocean', 'settings.json')] : []),
      ...(workspacePath ? [
        path.join(workspacePath, '.claude', 'settings.json'),
        path.join(workspacePath, '.ocean', 'settings.json'),
        path.join(workspacePath, '.claude', 'settings.local.json'),
        path.join(workspacePath, '.ocean', 'settings.local.json'),
      ] : []),
    ].sort();
    const hash = createHash('sha256');
    if (managedSource.invalid) hash.update('invalid managed settings path');
    for (const file of files) {
      try {
        const info = fs.lstatSync(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) {
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

  /**
   * Check if a tool should be auto-allowed (no approval needed).
   */
  isAutoAllowed(toolName: string, workspacePath?: string, args?: any): boolean {
    const action = this.evaluateTool(toolName, workspacePath, args);
    return action === 'allow';
  }

  /**
   * Check if a tool is explicitly denied.
   */
  isDenied(toolName: string, workspacePath?: string, args?: any): boolean {
    const action = this.evaluateTool(toolName, workspacePath, args);
    return action === 'deny';
  }

  /**
   * Check if a tool requires user approval.
   */
  requiresApproval(
    toolName: string,
    workspacePath?: string,
    args?: any,
  ): boolean {
    const action = this.evaluateTool(toolName, workspacePath, args);
    return action === 'ask';
  }

  /**
   * Get current permission mode.
   */
  getMode(workspacePath?: string): PermissionMode {
    return this.loadSettings(workspacePath).mode ?? 'default';
  }

  /**
   * Get max MCP output tokens setting.
   */
  getMaxMcpOutputTokens(workspacePath?: string): number {
    return this.loadSettings(workspacePath).maxMcpOutputTokens ?? 25_000;
  }

  /**
   * Get the raw rules for inspection/debugging.
   */
  getRules(workspacePath?: string): NormalizedRule[] {
    this.loadSettings(workspacePath);
    return this.rulesFor(workspacePath);
  }

  /** Clear the in-memory projection after settings are changed on disk. */
  invalidateCache(): void {
    this.cache.clear();
  }

  private rulesFor(workspacePath?: string): NormalizedRule[] {
    const cacheKey = workspacePath
      ? path.resolve(workspacePath)
      : '__default__';
    return this.cache.get(cacheKey)?.rules ?? [];
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private tryLoadJson(filePath: string): PermissionSettings | null {
    try {
      const relative = path.relative(path.parse(filePath).root, filePath);
      let current = path.parse(filePath).root;
      for (const segment of relative.split(path.sep)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() && current !== '/var' && current !== '/tmp') throw new Error('symlinked settings path');
      }
      if (fs.statSync(filePath).size > 256 * 1024) throw new Error('settings file too large');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const value = parsePermissionSettings(JSON.parse(raw));
      if (!value) throw new Error('settings schema is invalid');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      this.logger.error(`Failed to load permission settings from ${filePath}: ${(error as Error).message}`);
      // A broken policy file must not silently fall back to a more permissive layer.
      return {
        mode: 'default',
        rules: [{ action: 'deny', pattern: '*', comment: 'Invalid settings file; repair it before running tools.' }],
      };
    }
  }

  /**
   * Merge two settings objects. Source overrides target.
   */
  private mergeSettings(
    target: PermissionSettings,
    source: PermissionSettings,
  ): PermissionSettings {
    return {
      ...target,
      ...source,
      // Source is higher priority, so its non-deny rules appear first.
      rules: [...(source.rules || []), ...(target.rules || [])],
      allow: [...(source.allow || []), ...(target.allow || [])],
      deny: [...(source.deny || []), ...(target.deny || [])],
      ask: [...(source.ask || []), ...(target.ask || [])],
      // Deep merge MCP server settings
      mcp: {
        servers: {
          ...(target.mcp?.servers || {}),
          ...(source.mcp?.servers || {}),
        },
      },
    };
  }
}
