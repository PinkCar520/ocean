import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import type { JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/types.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { homedir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliConfig } from '../types.js';

export interface McpServerEntry {
  id: string;
  name: string;
  command: string;
  type?: 'stdio' | 'http';
  url?: string;
  args: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

interface McpConfigFile {
  mcpServers: McpServerEntry[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  server: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Client Manager for CLI
 * Discovers and connects to MCP servers, exposes tools to AI
 */
export class McpClientManager {
  private clients = new Map<string, Client>();
  private toolRoutes = new Map<string, { serverId: string; toolName: string }>();
  private validators = new Map<string, JsonSchemaValidator<unknown>>();
  private config: McpConfigFile | null = null;

  private readonly diagnostics = new Map<string, { serverId: string; state: string }>();
  private readonly cliConfig: CliConfig;
  constructor(config: CliConfig) { this.cliConfig = structuredClone(config); }
  getDiagnostics() { return [...this.diagnostics.values()].map(item => ({ ...item })); }
  private diagnose(serverId: string, error: unknown, fallback: string) {
    const status = (error as any)?.status ?? (error as any)?.code;
    const state = status === 401 || status === 403 ? 'authentication_failed' : fallback;
    this.diagnostics.set(serverId, { serverId, state });
  }

  /**
   * Load MCP config from config file
   */
  async loadConfig(configPath?: string) {
    await this.disconnectAll();
    const workspace = path.resolve(this.cliConfig.workspacePath ?? process.cwd());
    const oceanRoot = findRoot(workspace);
    const pathsToTry = [
      configPath,
      path.join(homedir(), '.ocean', 'mcp.json'),
      path.join(workspace, '.mcp.json'),
      path.join(workspace, '.claude', 'mcp.json'),
      path.join(workspace, '.ocean', 'mcp.json'),
      oceanRoot ? path.join(oceanRoot, '.ocean', 'mcp.json') : null,
    ].filter(Boolean) as string[];

    for (const p of pathsToTry) {
      if (fs.existsSync(p!)) {
        const info = fs.lstatSync(p);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error('Unsafe MCP configuration');
        if (path.resolve(p) === path.join(homedir(), '.ocean', 'mcp.json') && (info.mode & 0o077)) throw new Error('Personal MCP credentials require private file permissions');
        const raw = fs.readFileSync(p!, 'utf-8');
        this.config = normalizeMcpConfig(JSON.parse(raw));
        // Repository enabled flags cannot grant trust to executable configuration.
        if (!configPath && path.resolve(p) !== path.join(homedir(), '.ocean', 'mcp.json')) {
          this.config.mcpServers = this.config.mcpServers.map((server) => ({ ...server, enabled: false }));
        }
        // Resolve ${OCEAN_ROOT} in paths
        if (oceanRoot && this.config) {
          this.config.mcpServers = this.config.mcpServers.map((s: McpServerEntry) => ({
            ...s,
            command: replaceEnvVars(s.command, {
              ...process.env,
              OCEAN_ROOT: oceanRoot,
              GATEWAY_ROOT: process.env.GATEWAY_ROOT || path.join(oceanRoot, 'apps', 'gateway'),
            }),
            args: s.args.map((arg) => replaceEnvVars(arg, {
              ...process.env,
              OCEAN_ROOT: oceanRoot,
              GATEWAY_ROOT: process.env.GATEWAY_ROOT || path.join(oceanRoot, 'apps', 'gateway'),
            })),
          }));
        }
        console.log(`[MCP] Loaded config from: ${p}`);
        return;
      }
    }

    console.log('[MCP] No config file found, using defaults');
    this.config = { mcpServers: [] };
  }

  /**
   * Connect to all enabled MCP servers
   */
  async connectAll() {
    if (!this.config) {
      await this.loadConfig();
    }

    // Starting an MCP command executes local code. Require explicit opt-in in project config.
    const servers = this.config!.mcpServers.filter((server) => server.enabled === true);
    const disabledCount = this.config!.mcpServers.length - servers.length;
    if (disabledCount > 0) {
      console.log(`[MCP] Skipped ${disabledCount} server(s) without explicit enabled: true trust.`);
    }

    for (const server of servers) {
      try {
        await this.connectServer(server);
      } catch (err: any) {
        this.diagnose(server.id, err, 'connection_failed');
        console.warn('[MCP] Connection failed; inspect getDiagnostics().');
      }
    }
  }

  /**
   * Connect to a single MCP server
   */
  private async connectServer(server: McpServerEntry) {
    const resolvedArgs = server.args.map(arg =>
      replaceEnvVars(arg, process.env)
    );

    const resolvedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(server.env || {})) {
      resolvedEnv[key] = replaceEnvVars(value, process.env);
    }

    if (this.clients.has(server.id)) return;
    const transport = server.type === 'http'
      ? new StreamableHTTPClientTransport(new URL(server.url!))
      : new StdioClientTransport({
      command: replaceEnvVars(server.command, process.env),
      args: resolvedArgs,
      env: resolvedEnv,
      cwd: this.cliConfig.workspacePath ?? process.cwd(),
    });

    const client = new Client(
      { name: `ocean-cli-mcp-${server.id}`, version: '1.0.0' },
      { capabilities: {} }
    );

    try {
      await client.connect(transport, { timeout: 10_000 });
      await client.listTools({}, { timeout: 10_000 });
      this.clients.set(server.id, client);
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
    this.diagnostics.set(server.id, { serverId: server.id, state: 'connected' });
    const tools = await client.listTools({}, { timeout: 10_000 });
    console.log(`[MCP] Connected to ${server.name}: ${tools.tools.length} tools`);
  }

  /**
   * Get all tools from all connected MCP servers
   */
  async getAllTools(): Promise<McpToolDefinition[]> {
    const tools: McpToolDefinition[] = [];
    this.toolRoutes.clear();
    this.validators.clear();

    for (const [serverId, client] of this.clients) {
      try {
        const result = await client.listTools({}, { timeout: 10_000 });
        for (const tool of result.tools) {
          const toolName = tool.name;
          if (!/^[a-zA-Z0-9_-]+$/.test(toolName) || tool.inputSchema?.type !== 'object') throw new Error('Invalid MCP tool schema or name');
          const publicName = `mcp__${serverId}__${toolName}`;
          if (this.toolRoutes.has(publicName)) throw new Error('Ambiguous MCP tool name');
          this.validators.set(publicName, new AjvJsonSchemaValidator().getValidator(tool.inputSchema));
          tools.push({
            name: `mcp__${serverId}__${toolName}`,
            description: tool.description || '',
            server: serverId,
            inputSchema: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
          });
          this.toolRoutes.set(`mcp__${serverId}__${toolName}`, { serverId, toolName });
        }
      } catch (error) {
        this.diagnose(serverId, error, 'discovery_failed');
      }
    }

    return tools;
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(toolName: string, args: Record<string, any>, options: { signal?: AbortSignal } = {}) {
    options.signal?.throwIfAborted();
    const route = this.toolRoutes.get(toolName);
    if (!route) throw new Error(`Unknown MCP tool: ${toolName}`);
    const validation = this.validators.get(toolName)?.(args);
    if (validation && !validation.valid) throw new Error(`Invalid MCP tool arguments: ${validation.errorMessage}`);
    const { serverId, toolName: remoteToolName } = route;
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`MCP server not connected: ${serverId}`);
    }

    try {
    const result = await client.callTool({
      name: remoteToolName,
      arguments: args,
    }, undefined, { signal: options.signal, timeout: 60_000 });

    return result;
    } catch (error) {
      throw new Error(`MCP execution outcome unknown; do not automatically retry ${toolName}: remote connection failed`);
    }
  }

  /**
   * Disconnect all MCP servers
   */
  async disconnectAll() {
    const serverIds = Array.from(this.clients.keys());

    for (const [serverId, client] of this.clients) {
      try {
        await client.close();
      } catch (err: any) {
        // ignore
      }
    }
    this.clients.clear();
    this.validators.clear();
    this.toolRoutes.clear();


  }
}

function replaceEnvVars(str: string, env: NodeJS.ProcessEnv): string {
  return str.replace(/\$\{(\w+)\}/g, (_, key) => env[key] || '');
}

export function normalizeMcpConfig(value: unknown): McpConfigFile {
  if (!value || typeof value !== 'object' || !('mcpServers' in value)) {
    throw new Error('MCP config must contain mcpServers');
  }
  const source = (value as { mcpServers: unknown }).mcpServers;
  const entries: Array<[string, any]> = Array.isArray(source)
    ? source.map((entry: any) => [String(entry?.id ?? ''), entry])
    : source && typeof source === 'object'
      ? Object.entries(source)
      : [];
  if (!Array.isArray(source) && (!source || typeof source !== 'object')) {
    throw new Error('MCP mcpServers must be an array or object');
  }

  const ids = new Set<string>();
  const mcpServers = entries.map(([key, raw]: [string, any]) => {
    const id = raw?.id || key;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || ids.has(id)) {
      throw new Error(`MCP server id is invalid or duplicated: ${id}`);
    }
    ids.add(id);
    if (raw?.type !== undefined && !['stdio', 'http'].includes(raw.type)) throw new Error('Unsupported MCP transport');
    if (raw?.type === 'http') {
      const url = new URL(raw.url);
      if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Unsafe MCP HTTP URL');
    }
    if (raw?.type !== 'http' && (typeof raw?.command !== 'string' || !raw.command.trim())) {
      throw new Error(`MCP server ${id} must define a stdio command`);
    }
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
      throw new Error(`MCP server ${id} enabled must be a boolean`);
    }
    if (raw.args !== undefined && (!Array.isArray(raw.args) || raw.args.some((arg: unknown) => typeof arg !== 'string'))) {
      throw new Error(`MCP server ${id} args must be an array of strings`);
    }
    const env = raw.env ?? {};
    if (!env || typeof env !== 'object' || Array.isArray(env)
      || Object.values(env).some((item) => typeof item !== 'string')) {
      throw new Error(`MCP server ${id} env must contain string values`);
    }
    return {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : id,
      type: raw.type ?? 'stdio',
      url: raw.url,
      command: raw.command ?? '',
      args: raw.args ?? [],
      env: env as Record<string, string>,
      enabled: raw.enabled,
    };
  });
  return { mcpServers };
}

/**
 * Find the Ocean project root by walking up the directory tree
 */
function findRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) && fs.existsSync(path.join(current, 'apps', 'gateway'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
