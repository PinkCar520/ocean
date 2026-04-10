import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface CreateMCPServerDto {
  name: string;
  description?: string;
  category?: string;
  transport?: string;
  command?: string;
  args?: any;
  env?: any;
  enabled?: boolean;
}

export interface UpdateMCPServerDto {
  name?: string;
  description?: string;
  category?: string;
  transport?: string;
  command?: string;
  args?: any;
  env?: any;
  enabled?: boolean;
}

@Injectable()
export class MCPServerService {
  constructor(
    @Inject('PRISMA_CLIENT') private prisma: PrismaClient,
    private configService: ConfigService,
  ) {}

  async getServers(params?: { category?: string; enabled?: boolean }) {
    const where: any = {};
    if (params?.category) {
      where.category = params.category;
    }
    if (params?.enabled !== undefined) {
      where.enabled = params.enabled;
    }

    return this.prisma.mCPServer.findMany({
      where,
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getServerById(id: string) {
    return this.prisma.mCPServer.findUnique({ where: { id } });
  }

  async createServer(data: CreateMCPServerDto) {
    return this.prisma.mCPServer.create({
      data: {
        ...data,
        transport: data.transport || 'stdio',
        enabled: data.enabled ?? true,
        status: 'unknown',
      },
    });
  }

  async updateServer(id: string, data: UpdateMCPServerDto) {
    return this.prisma.mCPServer.update({
      where: { id },
      data,
    });
  }

  async deleteServer(id: string) {
    return this.prisma.mCPServer.delete({ where: { id } });
  }

  /**
   * Check health of a single MCP Server by attempting a quick stdio ping.
   * For stdio transport, we spawn the process briefly and check if it starts.
   */
  async checkHealth(id: string): Promise<{ status: string; latency?: number }> {
    const server = await this.prisma.mCPServer.findUnique({ where: { id } });
    if (!server) {
      throw new Error('MCP Server not found');
    }

    if (!server.enabled) {
      return { status: 'offline' };
    }

    if (server.transport === 'stdio' && server.command) {
      return this.checkStdioHealth(server);
    }

    // For SSE/HTTP, mark as online if enabled (proper check would need endpoint)
    return { status: server.status };
  }

  private async checkStdioHealth(server: any): Promise<{ status: string; latency?: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      // Resolve env variables (${VAR} -> actual value)
      const env = this.resolveEnvVars(server.env || {});

      let child: ChildProcess;
      try {
        const resolvedPath = this.resolveCommandPath(server.command, server.args);
        child = spawn(resolvedPath, server.args || [], {
          env: { ...process.env, ...env },
          timeout: 3000,
        });
      } catch {
        this.updateServerStatus(server.id, 'offline');
        resolve({ status: 'offline', latency: Date.now() - start });
        return;
      }

      const timer = setTimeout(() => {
        child.kill();
        this.updateServerStatus(server.id, 'online');
        resolve({ status: 'online', latency: Date.now() - start });
      }, 3000);

      child.on('error', () => {
        clearTimeout(timer);
        this.updateServerStatus(server.id, 'offline');
        resolve({ status: 'offline', latency: Date.now() - start });
      });

      child.on('spawn', () => {
        clearTimeout(timer);
        child.kill();
        this.updateServerStatus(server.id, 'online');
        resolve({ status: 'online', latency: Date.now() - start });
      });

      child.stdout?.on('data', () => {
        // Process started and produced output — it's alive
        clearTimeout(timer);
        child.kill();
        this.updateServerStatus(server.id, 'online');
        resolve({ status: 'online', latency: Date.now() - start });
      });
    });
  }

  private resolveEnvVars(env: Record<string, string>): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      resolved[key] = value.replace(/\$\{(\w+)\}/g, (_, varName) => {
        return this.configService.get(varName, '');
      });
    }
    return resolved;
  }

  private resolveCommandPath(command: string, args: string[] = []): string {
    // If command is 'node' and args point to a relative path, resolve it
    if (command === 'node' && args?.[0]) {
      const relativePath = args[0];
      // Try relative to gateway root
      const gatewayRoot = path.join(__dirname, '../..');
      const absolutePath = path.resolve(gatewayRoot, relativePath);
      if (fs.existsSync(absolutePath)) {
        return absolutePath;
      }
      // Try relative to workspace root
      const workspaceRoot = path.join(__dirname, '../../..');
      const wsPath = path.resolve(workspaceRoot, relativePath);
      if (fs.existsSync(wsPath)) {
        return wsPath;
      }
    }
    return command;
  }

  private async updateServerStatus(id: string, status: string) {
    await this.prisma.mCPServer.update({
      where: { id },
      data: { status, lastCheck: new Date() },
    });
  }

  /**
   * Check health of all servers and update their status
   */
  async checkAllServers() {
    const servers = await this.prisma.mCPServer.findMany();
    const results = await Promise.allSettled(
      servers.map((server) => this.checkHealth(server.id)),
    );

    const statuses: Record<string, string> = {};
    servers.forEach((server, idx) => {
      const result = results[idx];
      statuses[server.id] =
        result.status === 'fulfilled' ? result.value.status : 'offline';
    });

    return statuses;
  }

  /**
   * Sync servers from mcp.config.json into the database (idempotent)
   */
  async syncFromConfig() {
    // Try multiple possible locations for mcp.config.json to support dev, build, and docker
    const possiblePaths = [
      path.join(__dirname, '../../mcp.config.json'), // dist/mcp-server/../../ (compiled)
      path.join(__dirname, '../mcp.config.json'),    // dist/../ (alternative build)
      path.join(process.cwd(), 'mcp.config.json'),   // from cwd
      path.join(process.cwd(), 'apps/gateway/mcp.config.json'), // from workspace root
    ];

    let configPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        configPath = p;
        break;
      }
    }

    if (!configPath) {
      return { synced: 0, message: 'No mcp.config.json found in expected locations' };
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const servers = config.mcpServers || [];

    let synced = 0;
    for (const srv of servers) {
      const existing = await this.prisma.mCPServer.findFirst({
        where: { name: srv.name },
      });

      if (existing) {
        // Update existing
        await this.prisma.mCPServer.update({
          where: { id: existing.id },
          data: {
            description: srv.description || existing.description,
            command: srv.command || existing.command,
            args: srv.args,
            env: srv.env,
            enabled: srv.enabled ?? existing.enabled,
          },
        });
      } else {
        // Create new
        await this.prisma.mCPServer.create({
          data: {
            name: srv.name,
            description: srv.description,
            command: srv.command,
            args: srv.args,
            env: srv.env,
            enabled: srv.enabled ?? true,
            status: 'unknown',
            transport: 'stdio',
          },
        });
      }
      synced++;
    }

    return { synced, message: `Synced ${synced} MCP servers from config` };
  }
}
