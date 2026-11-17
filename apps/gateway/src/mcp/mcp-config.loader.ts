import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * MCP Server configuration entry
 */
export interface MCPServerConfig {
  id: string;
  name: string;
  command?: string;
  url?: string;
  headers?: Record<string, string>;
  oauthFetch?: typeof fetch;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  description?: string;
  transport?: 'stdio' | 'http' | 'sse';
}

/**
 * MCP Config file structure
 */
export interface MCPConfigFile {
  mcpServers: MCPServerConfig[];
}

/**
 * Multi-layer MCP Configuration Loader
 *
 * Supports 3 configuration layers (Claude Code compatible):
 *   1. Local (cwd/.mcp.json or cwd/.claude/mcp.json) - highest priority
 *   2. Project (.mcp.json in workspace root, git-tracked) - medium priority
 *   3. User (~/.ocean/mcp.json) - lowest priority
 *
 * Layers are merged with later overriding earlier.
 * Environment variables in args/env are expanded.
 */
@Injectable()
export class MCPConfigLoader {
  private readonly logger = new Logger(MCPConfigLoader.name);

  /**
   * Load and merge MCP configs from all layers.
   * Returns merged config with higher priority layers overriding lower ones.
   */
  loadConfig(
    workspacePath?: string,
    options: { userHome?: string; includeLocal?: boolean; env?: Record<string, string>; envFallback?: boolean } = {},
  ): MCPConfigFile {
    // Discover layers independently, then merge in ascending priority:
    // built-in < user < project < workspace-local.
    const userHome = options.userHome ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
    const userConfig = userHome
      ? this.tryLoadJson(path.join(userHome, '.ocean', 'mcp.json'))
      : null;

    const projectConfig = workspacePath
      ? this.tryLoadJson(path.join(workspacePath, '.mcp.json'))
        || this.tryLoadJson(path.join(workspacePath, '.claude', 'mcp.json'))
      : null;

    // Scoped tenants skip cwd so the Gateway process directory cannot leak servers.
    const localConfig = options.includeLocal === false
      ? null
      : this.tryLoadJson(path.join(process.cwd(), '.mcp.json'))
        || this.tryLoadJson(path.join(process.cwd(), '.claude', 'mcp.json'));

    const gatewayRoot = process.env.GATEWAY_ROOT || process.cwd();
    const builtinConfig = this.tryLoadJson(path.join(gatewayRoot, 'mcp.config.json'));

    if (builtinConfig) this.logger.debug('Loaded built-in MCP config from gateway');
    if (userConfig) this.logger.debug('Loaded user MCP config from the scoped home');
    if (projectConfig) this.logger.debug('Loaded project MCP config from workspace');
    if (localConfig) this.logger.debug('Loaded local MCP config from cwd');

    const layers = [builtinConfig, userConfig, projectConfig, localConfig]
      .filter((layer): layer is MCPConfigFile => layer !== null);

    // Merge layers (later overrides earlier).
    const merged: MCPConfigFile = { mcpServers: [] };
    const serverMap = new Map<string, MCPServerConfig>();

    for (const layer of layers) {
      for (const server of layer.mcpServers || []) {
        serverMap.set(server.id, server);
      }
    }

    merged.mcpServers = [...serverMap.values()];

    // Expand environment variables
    merged.mcpServers = merged.mcpServers.map((srv) => this.expandEnvVars(srv, options.env ?? {}, options.envFallback !== false));

    this.logger.log(
      `MCP config loaded. Servers: ${merged.mcpServers.length}, Enabled: ${merged.mcpServers.filter((s) => s.enabled).length}`,
    );
    return merged;
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private tryLoadJson(filePath: string): MCPConfigFile | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as MCPConfigFile;
    } catch {
      return null;
    }
  }

  /**
   * Expand environment variables in args and env.
   * Supports ${VAR} and ${VAR:-default} syntax.
   */
  private expandEnvVars(config: MCPServerConfig, scopedEnv: Record<string, string>, fallback: boolean): MCPServerConfig {
    const expand = (value: string): string => {
      return value.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
        const [varName, defaultValue] = expr.split(':-');
        const scoped = scopedEnv[varName];
        if (scoped !== undefined) return scoped;
        return (fallback ? process.env[varName] : undefined) || defaultValue || '';
      });
    };

    return {
      ...config,
      args: (config.args || []).map(expand),
      url: config.url ? expand(config.url) : undefined,
      headers: config.headers ? Object.fromEntries(Object.entries(config.headers).map(([key, value]) => [key, expand(value)])) : undefined,
      env: config.env
        ? Object.fromEntries(
            Object.entries(config.env).map(([k, v]) => [k, expand(v)]),
          )
        : {},
    };
  }
}
