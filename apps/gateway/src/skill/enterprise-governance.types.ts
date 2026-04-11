/**
 * Enterprise Governance Types
 *
 * Supports organization-managed settings that cannot be overridden by users.
 * Similar to Claude Code's managed-settings.json and managed-mcp.json.
 */

import { PermissionSettings, PermissionRule } from './permission.types';

/**
 * Managed settings - deployed by IT/admin, cannot be overridden.
 * Takes absolute precedence over user/project/local settings.
 */
export interface ManagedSettings {
  /** Organization name that deployed these settings */
  organization?: string;
  /** Version of the managed settings */
  version?: string;
  /** Permission settings that cannot be overridden */
  settings: PermissionSettings;
}

/**
 * MCP denylist - organization-level server blocking.
 * Exact command/server match required.
 */
export interface ManagedMcpConfig {
  /** Organization name that deployed these settings */
  organization?: string;
  /** Version of the MCP config */
  version?: string;
  /** Servers that are explicitly denied (cannot be enabled) */
  deniedServers: string[];
  /** Servers that are forced enabled with specific config */
  forcedServers?: Record<string, {
    enabled: true;
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

/**
 * Load managed settings from file.
 * Returns null if file doesn't exist or is invalid.
 */
export function loadManagedSettings(filePath: string): ManagedSettings | null {
  const fs = require('fs');
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ManagedSettings;
  } catch {
    return null;
  }
}

/**
 * Load managed MCP config from file.
 * Returns null if file doesn't exist or is invalid.
 */
export function loadManagedMcpConfig(filePath: string): ManagedMcpConfig | null {
  const fs = require('fs');
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ManagedMcpConfig;
  } catch {
    return null;
  }
}

/**
 * Merge managed settings with regular settings.
 * Managed settings take absolute precedence.
 */
export function mergeWithManagedSettings(
  regular: PermissionSettings,
  managed: ManagedSettings | null,
): PermissionSettings {
  if (!managed) return regular;

  return {
    ...regular,
    ...managed.settings,
    // Managed rules come first (highest precedence)
    rules: [...(managed.settings.rules || []), ...(regular.rules || [])],
    deny: [...(managed.settings.deny || []), ...(regular.deny || [])],
    // Force mode if managed specifies it
    mode: managed.settings.mode || regular.mode,
  };
}

/**
 * Check if an MCP server is allowed based on managed config.
 * Returns false if server is in denylist.
 */
export function isMcpServerAllowed(
  serverId: string,
  managedConfig: ManagedMcpConfig | null,
): boolean {
  if (!managedConfig) return true;
  return !managedConfig.deniedServers.includes(serverId);
}
