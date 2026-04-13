import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { tool, jsonSchema } from 'ai';
import * as fs from 'fs';
import * as path from 'path';
import type {
  MCPServerConfig,
  MCPServerFileConfig,
  MCPResource,
  MCPResourceContents,
  MCPResourceTemplate,
  MCPPrompt,
  MCPElicitationRequest,
  MCPElicitationResponse,
  MCPTransportType,
} from './mcp.types';
import { createTransport } from './mcp-transport.factory';

interface ManagedMCPClient {
  client: Client;
  transport: Transport;
  config: MCPServerConfig;
  transportType: MCPTransportType;
  /** 资源缓存 */
  resourceCache?: Map<string, { content: MCPResourceContents; expiresAt: number }>;
  /** 征求回调映射 */
  elicitationCallbacks?: Map<string, (response: MCPElicitationResponse) => void>;
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

  private replaceVars(value: string): string {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => {
      return this.configService.get<string>(name) || process.env[name] || '';
    });
  }

  private resolveServerConfig(config: MCPServerConfig): MCPServerConfig {
    return {
      ...config,
      command: config.command ? this.replaceVars(config.command) : undefined,
      args: (config.args || []).map((arg) => this.replaceVars(arg)),
      url: config.url ? this.replaceVars(config.url) : undefined,
      headers: Object.fromEntries(
        Object.entries(config.headers || {}).map(([key, val]) => [key, this.replaceVars(val)]),
      ),
      env: Object.fromEntries(
        Object.entries(config.env || {}).map(([key, val]) => [key, this.replaceVars(val)]),
      ),
    };
  }

  // ──────────────────────────────────────────────
  // 生命周期：启动
  // ──────────────────────────────────────────────
  async onModuleInit() {
    const configPath = path.join(__dirname, '../../../../../mcp.config.json');

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

    const resolvedServers = fileConfig.mcpServers.map((srv) => this.resolveServerConfig(srv));

    const enabledServers = resolvedServers.filter((s) => s.enabled);
    this.logger.log(`Found ${enabledServers.length} enabled MCP server(s): ${enabledServers.map((s) => s.id).join(', ')}`);

    // 并行启动所有 enabled MCP Servers
    await Promise.allSettled(
      enabledServers.map((srv) => this.connectServerLegacy(srv)),
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
  // 内部：连接单个 MCP Server（旧版，仅用于初始化）
  // ──────────────────────────────────────────────
  private async connectServerLegacy(config: MCPServerConfig): Promise<void> {
    try {
      const resolvedConfig = this.resolveServerConfig(config);

      const transport = new StdioClientTransport({
        command: resolvedConfig.command!,
        args: resolvedConfig.args || [],
        env: { ...process.env, ...(resolvedConfig.env || {}) } as Record<string, string>,
      });

      const client = new Client({
        name: 'uclaw-gateway',
        version: '1.0.0',
      });

      await client.connect(transport);
      this.clients.set(resolvedConfig.id, {
        client,
        transport,
        config: resolvedConfig,
        transportType: 'stdio',
        resourceCache: new Map(),
        elicitationCallbacks: new Map(),
      });

      // 验证工具列表
      const { tools } = await client.listTools();
      this.logger.log(`[${resolvedConfig.id}] Connected. Tools: [${tools.map((t) => t.name).join(', ')}]`);

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
              (toolDef.inputSchema ?? { type: 'object', properties: {} }) as any,
            ),
            execute: async (params: any) => {
              this.logger.debug(`[MCP:${serverId}] Calling tool: ${toolDef.name}`);
              try {
                const result = await managed.client.callTool({
                  name: toolDef.name,
                  arguments: params,
                });
                // MCP 返回 content 数组，取第一个 text 内容
                const content = result.content as Array<{ type: string; text?: string }>;
                const textContent = content.find((c) => c.type === 'text');
                const rawText = textContent?.text ?? JSON.stringify(content);

                // ── UI Protocol 解析 ──
                // 检测 __UI__:{"uiType":"...","props":{...}} 标记
                const uiMatch = rawText.match(/__UI__:([\s\S]*?)$/);
                if (uiMatch) {
                  try {
                    const uiData = JSON.parse(uiMatch[1]);
                    const cleanText = rawText.replace(/__UI__:.*$/, '').trim();
                    // 返回包含 ui 字段的对象，AI SDK 会将其作为 tool result 返回给 LLM
                    return { content: cleanText, ui: uiData };
                  } catch (parseErr) {
                    this.logger.warn(`[MCP:${serverId}] Failed to parse __UI__ marker: ${(parseErr as Error).message}`);
                  }
                }

                return { content: rawText, ui: undefined };
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
    const configPath = path.join(__dirname, '../../../../../mcp.config.json');
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

  /**
   * 获取当前已连接的 MCP Server ID 列表
   */
  getConnectedServerIds(): string[] {
    return Array.from(this.clients.keys());
  }

  // ──────────────────────────────────────────────
  // MCP Resources 能力
  // ──────────────────────────────────────────────

  /**
   * 获取所有 MCP Server 暴露的资源列表
   */
  async listResources(): Promise<MCPResource[]> {
    const allResources: MCPResource[] = [];

    for (const [serverId, managed] of this.clients.entries()) {
      try {
        const { resources } = await managed.client.listResources();
        allResources.push(
          ...(resources || []).map((r: any) => ({
            ...r,
            serverId,
          })),
        );
      } catch (err) {
        this.logger.warn(`[${serverId}] Failed to list resources: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Listed ${allResources.length} resources from ${this.clients.size} server(s)`);
    return allResources;
  }

  /**
   * 获取资源模板列表
   */
  async listResourceTemplates(): Promise<MCPResourceTemplate[]> {
    const allTemplates: MCPResourceTemplate[] = [];

    for (const [serverId, managed] of this.clients.entries()) {
      try {
        const { resourceTemplates } = await managed.client.listResourceTemplates();
        allTemplates.push(
          ...(resourceTemplates || []).map((t: any) => ({
            ...t,
            serverId,
          })),
        );
      } catch (err) {
        this.logger.warn(`[${serverId}] Failed to list resource templates: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Listed ${allTemplates.length} resource templates from ${this.clients.size} server(s)`);
    return allTemplates;
  }

  /**
   * 读取指定资源的内容（带缓存）
   */
  async readResource(uri: string, serverId?: string): Promise<MCPResourceContents | null> {
    // 尝试从缓存读取
    if (!serverId) {
      // 如果没有指定 serverId，遍历所有客户端查找匹配的 URI
      for (const [sid, managed] of this.clients.entries()) {
        const cache = managed.resourceCache;
        if (cache?.has(uri)) {
          const cached = cache.get(uri)!;
          if (Date.now() < cached.expiresAt) {
            this.logger.debug(`[Resource] Cache hit for ${uri}`);
            return cached.content;
          }
          cache.delete(uri);
        }
      }
    } else {
      const managed = this.clients.get(serverId);
      const cache = managed?.resourceCache;
      if (cache?.has(uri)) {
        const cached = cache.get(uri)!;
        if (Date.now() < cached.expiresAt) {
          this.logger.debug(`[Resource:${serverId}] Cache hit for ${uri}`);
          return cached.content;
        }
        cache.delete(uri);
      }
    }

    // 缓存未命中，从 MCP Server 读取
    const targetClients = serverId
      ? [[serverId, this.clients.get(serverId)].filter(Boolean) as [string, ManagedMCPClient]]
      : Array.from(this.clients.entries());

    for (const [sid, managed] of targetClients) {
      try {
        const result = await managed.client.readResource({ uri });
        const contents = result.contents?.[0];

        if (contents) {
          // 写入缓存（TTL 5 分钟）
          const cache = managed.resourceCache || new Map();
          cache.set(uri, {
            content: contents as MCPResourceContents,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
          managed.resourceCache = cache;

          this.logger.debug(`[Resource:${sid}] Read resource: ${uri}`);
          return contents as MCPResourceContents;
        }
      } catch (err) {
        this.logger.warn(`[Resource:${sid}] Failed to read resource ${uri}: ${(err as Error).message}`);
      }
    }

    this.logger.warn(`[Resource] Resource not found: ${uri}`);
    return null;
  }

  // ──────────────────────────────────────────────
  // MCP Prompts 能力
  // ──────────────────────────────────────────────

  /**
   * 获取所有 MCP Server 的提示词模板列表
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    const allPrompts: MCPPrompt[] = [];

    for (const [serverId, managed] of this.clients.entries()) {
      try {
        const { prompts } = await managed.client.listPrompts();
        allPrompts.push(
          ...(prompts || []).map((p: any) => ({
            ...p,
            serverId,
          })),
        );
      } catch (err) {
        this.logger.warn(`[${serverId}] Failed to list prompts: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Listed ${allPrompts.length} prompts from ${this.clients.size} server(s)`);
    return allPrompts;
  }

  /**
   * 获取指定提示词的完整内容（含变量填充）
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>,
    serverId?: string,
  ): Promise<GetPromptResult | null> {
    const targetClients = serverId
      ? [[serverId, this.clients.get(serverId)].filter(Boolean) as [string, ManagedMCPClient]]
      : Array.from(this.clients.entries());

    for (const [sid, managed] of targetClients) {
      try {
        const result = await managed.client.getPrompt({
          name,
          arguments: args || {},
        });

        this.logger.debug(`[Prompt:${sid}] Retrieved prompt: ${name}`);
        return result;
      } catch (err) {
        this.logger.debug(`[Prompt:${sid}] Prompt ${name} not found: ${(err as Error).message}`);
      }
    }

    this.logger.warn(`[Prompt] Prompt not found: ${name}`);
    return null;
  }

  // ──────────────────────────────────────────────
  // MCP Elicitation 能力
  // ──────────────────────────────────────────────

  /**
   * 注册征求响应回调（由前端用户交互触发）
   */
  registerElicitationResponseCallback(id: string, callback: (response: MCPElicitationResponse) => void): void {
    for (const managed of this.clients.values()) {
      const callbacks = managed.elicitationCallbacks || new Map();
      callbacks.set(id, callback);
      managed.elicitationCallbacks = callbacks;
    }
    this.logger.log(`[Elicitation] Registered callback for request: ${id}`);
  }

  /**
   * 处理用户提交的征求响应
   */
  async submitElicitationResponse(response: MCPElicitationResponse): Promise<void> {
    // 查找对应的客户端和回调
    for (const managed of this.clients.values()) {
      const callbacks = managed.elicitationCallbacks;
      if (callbacks?.has(response.id)) {
        const callback = callbacks.get(response.id)!;
        callbacks.delete(response.id);
        callback(response);
        this.logger.log(`[Elicitation] Submitted response for request: ${response.id}`);
        return;
      }
    }
    this.logger.warn(`[Elicitation] No pending request found: ${response.id}`);
  }

  /**
   * 获取待处理的征求请求列表
   */
  getPendingElicitations(): MCPElicitationRequest[] {
    const pending: MCPElicitationRequest[] = [];

    for (const [serverId, managed] of this.clients.entries()) {
      const callbacks = managed.elicitationCallbacks;
      if (callbacks && callbacks.size > 0) {
        // 这里可以扩展为维护一个待处理队列
        // 当前实现为占位，实际由 MCP Server 主动推送
      }
    }

    return pending;
  }

  // ──────────────────────────────────────────────
  // 动态连接管理（热加载支持）
  // ──────────────────────────────────────────────

  /**
   * 动态连接新的 MCP Server（支持多传输协议）
   */
  async connectServer(config: MCPServerConfig): Promise<void> {
    const resolvedConfig = this.resolveServerConfig(config);
    const transportType = resolvedConfig.transport || 'stdio';

    try {
      // 使用传输工厂创建对应类型的传输
      const transport = await createTransport(resolvedConfig);

      const client = new Client({
        name: 'uclaw-gateway',
        version: '1.0.0',
      });

      await client.connect(transport);
      this.clients.set(resolvedConfig.id, {
        client,
        transport,
        config: resolvedConfig,
        transportType,
        resourceCache: new Map(),
        elicitationCallbacks: new Map(),
      });

      // 工具缓存失效
      this.cachedAITools = null;

      // 验证工具列表
      const { tools } = await client.listTools();
      this.logger.log(`[${resolvedConfig.id}] Connected via ${transportType}. Tools: [${tools.map((t) => t.name).join(', ')}]`);
    } catch (err) {
      this.logger.error(`[${resolvedConfig.id}] Failed to connect via ${transportType}: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * 断开指定 MCP Server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const managed = this.clients.get(serverId);
    if (!managed) {
      this.logger.warn(`[${serverId}] Not connected, ignoring disconnect`);
      return;
    }

    try {
      await managed.client.close();
      this.clients.delete(serverId);
      this.cachedAITools = null;
      this.logger.log(`[${serverId}] Disconnected`);
    } catch (err) {
      this.logger.warn(`[${serverId}] Error during disconnect: ${(err as Error).message}`);
    }
  }

  /**
   * 重连指定 MCP Server
   */
  async reconnectServer(serverId: string): Promise<void> {
    const managed = this.clients.get(serverId);
    if (!managed) {
      throw new Error(`Server ${serverId} not found`);
    }

    const config = managed.config;
    await this.disconnectServer(serverId);
    await this.connectServer(config);
    this.logger.log(`[${serverId}] Reconnected`);
  }
}
