import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tool, jsonSchema } from 'ai';
import * as fs from 'fs';
import * as path from 'path';
import type { MCPServerConfig, MCPServerFileConfig } from './mcp.types';

interface ManagedMCPClient {
  client: Client;
  transport: StdioClientTransport;
  config: MCPServerConfig;
}

/**
 * MCPClientManager
 *
 * Gateway 侧的 MCP 客户端管理器，负责：
 * 1. 从 mcp.config.json 读取所有 MCP Server 配置
 * 2. 以子进程（stdio）方式动态启动并连接各 MCP Server
 * 3. 聚合所有工具，向 ChatService 提供统一的 AI SDK 工具集
 * 4. 模块销毁时优雅关闭所有子进程
 */
@Injectable()
export class MCPClientManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MCPClientManager.name);
  private clients = new Map<string, ManagedMCPClient>();
  
  /** 聚合后的工具定义缓存 */
  private cachedAITools: Record<string, any> | null = null;

  constructor(private configService: ConfigService) {}

  // ──────────────────────────────────────────────
  // 生命周期：启动
  // ──────────────────────────────────────────────
  async onModuleInit() {
    const configPath = path.join(__dirname, '../../mcp.config.json');
    
    if (!fs.existsSync(configPath)) {
      this.logger.warn(`mcp.config.json not found at ${configPath}. MCP layer disabled.`);
      return;
    }

    let fileConfig: MCPServerFileConfig;
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch (err) {
      this.logger.error(`Failed to parse mcp.config.json: ${(err as Error).message}`);
      return;
    }

    const enabledServers = fileConfig.mcpServers.filter((s) => s.enabled);
    this.logger.log(`Found ${enabledServers.length} enabled MCP server(s): ${enabledServers.map((s) => s.id).join(', ')}`);

    // 并行启动所有 enabled MCP Servers
    await Promise.allSettled(
      enabledServers.map((srv) => this.connectServer(srv)),
    );

    this.logger.log(`MCPClientManager initialized. Connected: [${Array.from(this.clients.keys()).join(', ')}]`);
  }

  // ──────────────────────────────────────────────
  // 生命周期：关闭
  // ──────────────────────────────────────────────
  async onModuleDestroy() {
    this.logger.log('Shutting down all MCP client connections...');
    for (const [id, managed] of this.clients.entries()) {
      try {
        await managed.client.close();
        this.logger.log(`[${id}] Disconnected`);
      } catch (err) {
        this.logger.warn(`[${id}] Error during disconnect: ${(err as Error).message}`);
      }
    }
    this.clients.clear();
  }

  // ──────────────────────────────────────────────
  // 内部：连接单个 MCP Server
  // ──────────────────────────────────────────────
  private async connectServer(config: MCPServerConfig): Promise<void> {
    try {
      // 替换 env 里的 ${VAR} 占位符
      const resolvedEnv: Record<string, string> = {};
      for (const [key, val] of Object.entries(config.env || {})) {
        resolvedEnv[key] = val.replace(/\$\{(\w+)\}/g, (_, name) => {
          return this.configService.get<string>(name) || process.env[name] || '';
        });
      }

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...resolvedEnv } as Record<string, string>,
      });

      const client = new Client({
        name: 'uclaw-gateway',
        version: '1.0.0',
      });

      await client.connect(transport);
      this.clients.set(config.id, { client, transport, config });

      // 验证工具列表
      const { tools } = await client.listTools();
      this.logger.log(`[${config.id}] Connected. Tools: [${tools.map((t) => t.name).join(', ')}]`);
      
      // 工具缓存失效（强制下次重建）
      this.cachedAITools = null;
    } catch (err) {
      this.logger.error(`[${config.id}] Failed to connect: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────
  // 公共 API：获取聚合的 AI SDK 工具集
  // ──────────────────────────────────────────────
  async getAITools(): Promise<Record<string, any>> {
    if (this.cachedAITools) {
      return this.cachedAITools;
    }

    const aggregated: Record<string, any> = {};

    for (const [serverId, managed] of this.clients.entries()) {
      try {
        const { tools } = await managed.client.listTools();

        for (const toolDef of tools) {
          // 构造 AI SDK 兼容的 tool 对象
          aggregated[toolDef.name] = tool({
            description: toolDef.description || `Tool: ${toolDef.name}`,
            // 直接将 MCP 返回的 JSON Schema 透传给 AI SDK，
            // 完整保留参数的 type / description / required 等信息，
            // 避免 passthrough() 导致 LLM 不知道工具入参结构的问题。
            inputSchema: jsonSchema(
              (toolDef.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
            ),
            execute: async (params: Record<string, unknown>) => {
              this.logger.debug(`[MCP:${serverId}] Calling tool: ${toolDef.name}`);
              try {
                const result = await managed.client.callTool({
                  name: toolDef.name,
                  arguments: params,
                });
                // MCP 返回 content 数组，取第一个 text 内容
                const content = result.content as Array<{ type: string; text?: string }>;
                const textContent = content.find((c) => c.type === 'text');
                return textContent?.text ?? JSON.stringify(content);
              } catch (err) {
                this.logger.error(`[MCP:${serverId}] Tool call failed: ${(err as Error).message}`);
                throw err;
              }
            },
          });
        }
      } catch (err) {
        this.logger.warn(`[${serverId}] Failed to list tools: ${(err as Error).message}`);
      }
    }

    this.cachedAITools = aggregated;
    this.logger.log(`Tool registry built: [${Object.keys(aggregated).join(', ')}]`);
    return aggregated;
  }

  // ──────────────────────────────────────────────
  // 公共 API：获取已连接的 MCP Server 状态
  // ──────────────────────────────────────────────
  getServerStatus(): Array<{ id: string; name: string; connected: boolean }> {
    const allConfigs: MCPServerConfig[] = [];
    const configPath = path.join(__dirname, '../../mcp.config.json');
    if (fs.existsSync(configPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as MCPServerFileConfig;
        allConfigs.push(...raw.mcpServers);
      } catch { /* ignore */ }
    }

    return allConfigs.map((cfg) => ({
      id: cfg.id,
      name: cfg.name,
      connected: this.clients.has(cfg.id),
    }));
  }
}
