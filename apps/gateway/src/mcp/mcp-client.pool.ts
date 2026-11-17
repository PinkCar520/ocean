import { MCPOAuthService } from './mcp-oauth.service';
import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MCPClientManager } from './mcp-client.manager';
import { MCPConfigLoader } from './mcp-config.loader';
import { RpcGateway } from '../chat/rpc.gateway';

/** Logical tenant boundary for an MCP connection set. */
export interface MCPToolScope {
  userId: string;
  workspacePath?: string;
}

/** Stable, path-safe cache key; different users or workspaces never share a manager. */
export function mcpScopeKey(scope: MCPToolScope): string {
  if (!scope || typeof scope.userId !== 'string' || scope.userId.length === 0 || scope.userId.length > 200) {
    throw new Error('Invalid MCP scope principal');
  }
  if (scope.workspacePath !== undefined && (typeof scope.workspacePath !== 'string' || scope.workspacePath.length > 4096)) {
    throw new Error('Invalid MCP scope workspace');
  }
  return JSON.stringify([
    scope.userId,
    scope.workspacePath ? path.resolve(scope.workspacePath) : '',
  ]);
}

/** Optional per-user environment overlay; only this file may supply credentials. */
export async function readMCPUserEnv(userHome: string): Promise<Record<string, string>> {
  const file = path.join(userHome, '.ocean', 'mcp.env.json');
  try {
    for (const directory of [userHome, path.join(userHome, '.ocean')]) {
      const info = await fs.lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe MCP user environment directory');
    }
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new Error('Unsafe MCP user environment file');
    const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let parsed: unknown;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > 64 * 1024) throw new Error('Unsafe MCP user environment file');
      parsed = JSON.parse(await handle.readFile('utf8'));
    } finally { await handle.close(); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid MCP user environment');
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) || typeof value !== 'string' || value.length > 8192) {
        throw new Error('Invalid MCP user environment entry');
      }
      env[key] = value;
    }
    return env;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

/** Isolated config home per logical user; never reuse the Gateway process home. */
export function mcpUserHome(scope: MCPToolScope, root?: string): string {
  const base = path.resolve(root ?? process.env.OCEAN_MCP_USER_ROOT ?? path.join(os.homedir(), '.ocean', 'mcp-users'));
  const id = createHash('sha256').update(scope.userId).digest('hex').slice(0, 32);
  return path.join(base, id);
}

/**
 * MCPClientPool
 *
 * The Gateway serves multiple logical users. A single process-wide MCP client
 * set lets one user's tools, resources and elicitation callbacks leak into
 * another user's turn. Each (userId, workspace) pair therefore owns a separate
 * MCPClientManager, config home and tool cache. The pool itself never stores
 * credentials; it only routes to the isolated manager.
 */
@Injectable()
export class MCPClientPool implements OnModuleDestroy {
  private readonly logger = new Logger(MCPClientPool.name);
  private readonly scopes = new Map<string, { manager: MCPClientManager; ready: Promise<void>; lastUsed: number; envVersion: string }>();

  constructor(
    private readonly configLoader: MCPConfigLoader,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    private readonly rpcGateway: RpcGateway,
    @Optional() private readonly oauth?: MCPOAuthService,
  ) {}

  protected createManager(): MCPClientManager {
    return new MCPClientManager(this.configService, this.moduleRef, this.rpcGateway);
  }

  /** Lazily initialize the tenant's config and return only its tools. */
  async getAITools(scope: MCPToolScope): Promise<Record<string, any>> {
    const key = mcpScopeKey(scope);
    const userHome = mcpUserHome(scope);
    // Read before cache reuse so atomic replacement/removal revokes old credentials.
    const env = await readMCPUserEnv(userHome);
    const envVersion = createHash('sha256').update(JSON.stringify(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
    let entry = this.scopes.get(key);
    let retired: typeof entry;
    if (entry && entry.envVersion !== envVersion) {
      retired = entry;
      this.scopes.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const limit = Number(process.env.MCP_SCOPE_LIMIT ?? 64);
      if (Number.isSafeInteger(limit) && limit > 0 && this.scopes.size >= limit) {
        const oldest = [...this.scopes.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
        if (oldest) {
          this.scopes.delete(oldest[0]);
          void (async () => {
            try { await oldest[1].ready; } catch { /* init failure already surfaced */ }
            await oldest[1].manager.dispose();
          })();
        }
      }
      const manager = this.createManager();
      // Reserve the scope before the first await so concurrent callers share
      // one manager instead of racing to create duplicates.
      const created = {
        manager,
        envVersion,
        lastUsed: Date.now(),
        ready: Promise.resolve().then(async () => {
          if (retired) {
            try { await retired.ready; } catch { /* the original caller saw initialization failure */ }
            await retired.manager.dispose();
          }
          const config = this.configLoader.loadConfig(scope.workspacePath, {
            userHome,
            includeLocal: false,
            env,
            envFallback: process.env.OCEAN_MCP_ENV_FALLBACK === '1',
          });
          for (const server of config.mcpServers) {
            if (server.url && (server.transport === 'http' || server.transport === 'sse')) {
              server.oauthFetch = this.oauth?.transportFetch(scope.userId, server.id, server.url);
            }
          }
          await manager.initialize(config as any);
        }),
      };
      entry = created;
      this.scopes.set(key, created);
      created.ready.catch((error) => {
        if (this.scopes.get(key) === created) this.scopes.delete(key);
        this.logger.warn(`MCP scope initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }
    entry.lastUsed = Date.now();
    await entry.ready;
    return entry.manager.getAITools();
  }

  /** Drop all tenant managers; the next request reloads config fresh. */
  async invalidateAll(): Promise<void> {
    const entries = [...this.scopes.values()];
    this.scopes.clear();
    await Promise.allSettled(entries.map(async (entry) => {
      try { await entry.ready; } catch { /* initialization failure already surfaced to its caller */ }
      await entry.manager.dispose();
    }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.invalidateAll();
  }
}
