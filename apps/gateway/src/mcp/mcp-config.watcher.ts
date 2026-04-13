import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MCPClientManager } from '../mcp/mcp-client.manager';
import { MCPServerService } from '../mcp-server/mcp-server.service';
import * as fs from 'fs';
import * as path from 'path';
import type { MCPServerFileConfig } from './mcp.types';

/**
 * MCPConfigWatcher
 * 
 * 配置文件监听器，负责监听 mcp.config.json 和 .mcp.json 的变更，
 * 自动触发 MCP Server 的热加载/卸载。
 * 
 * 功能：
 * 1. 监听多个配置文件路径
 * 2. 防抖动处理（debounce 500ms）
 * 3. 自动对比新旧配置，按需连接/断开 Server
 * 4. 日志记录变更详情
 */
@Injectable()
export class MCPConfigWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MCPConfigWatcher.name);
  private watchers: ReturnType<typeof fs.watch>[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastConfigHash: string | null = null;

  /** 需要监听的配置文件路径列表 */
  private readonly configPaths = [
    'mcp.config.json',
    '.mcp.json',
    '.claude/mcp.json',
  ];

  constructor(
    private readonly mcpManager: MCPClientManager,
    private readonly mcpServerService: MCPServerService,
  ) {}

  async onModuleInit() {
    // 获取项目根目录
    const projectRoot = process.cwd();

    // 为每个配置路径设置监听
    for (const configPath of this.configPaths) {
      const fullPath = path.join(projectRoot, configPath);

      if (!fs.existsSync(fullPath)) {
        this.logger.debug(`Config file not found: ${fullPath}`);
        continue;
      }

      this.setupWatcher(fullPath);
    }

    // 计算初始配置哈希
    this.lastConfigHash = this.computeConfigHash();
    this.logger.log('MCPConfigWatcher initialized');
  }

  onModuleDestroy() {
    this.stopWatching();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.logger.log('MCPConfigWatcher stopped');
  }

  /**
   * 设置单个文件监听
   */
  private setupWatcher(filePath: string) {
    try {
      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.logger.log(`Config file changed: ${filePath}`);
          this.onConfigChanged();
        }
      });

      watcher.on('error', (err) => {
        this.logger.error(`Watcher error for ${filePath}: ${err.message}`);
      });

      this.watchers.push(watcher);
      this.logger.debug(`Watching: ${filePath}`);
    } catch (err) {
      this.logger.warn(`Failed to watch ${filePath}: ${(err as Error).message}`);
    }
  }

  /**
   * 配置文件变更事件处理（防抖动）
   */
  private onConfigChanged() {
    // 清除之前的定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // 设置新的定时器（500ms 防抖）
    this.debounceTimer = setTimeout(() => {
      this.reloadConfig();
    }, 500);
  }

  /**
   * 重新加载配置
   */
  private async reloadConfig() {
    try {
      // 计算新配置哈希
      const newHash = this.computeConfigHash();

      // 如果配置未变化，跳过
      if (newHash === this.lastConfigHash) {
        this.logger.debug('Config unchanged, skipping reload');
        return;
      }

      this.logger.log('Reloading MCP configuration...');

      // 读取当前已连接的 Server ID 列表（仅连接态）
      const currentServers = new Set(this.mcpManager.getConnectedServerIds());

      // 从配置文件读取新配置
      const newConfig = this.loadConfig();
      const newServers = new Set<string>(
        newConfig.mcpServers.filter((s) => s.enabled).map((s) => s.id),
      );

      // 计算差异
      const toAdd = [...newServers].filter((id) => !currentServers.has(id));
      const toRemove = [...currentServers].filter((id) => !newServers.has(id));

      // 连接新 Server
      for (const serverId of toAdd) {
        const config = newConfig.mcpServers.find((s) => s.id === serverId);
        if (config) {
          try {
            await this.mcpManager.connectServer(config);
            this.logger.log(`[${serverId}] Connected (hot-add)`);
          } catch (err) {
            this.logger.error(`[${serverId}] Failed to connect: ${(err as Error).message}`);
          }
        }
      }

      // 断开已移除的 Server
      for (const serverId of toRemove) {
        try {
          await this.mcpManager.disconnectServer(serverId);
          this.logger.log(`[${serverId}] Disconnected (hot-remove)`);
        } catch (err) {
          this.logger.error(`[${serverId}] Failed to disconnect: ${(err as Error).message}`);
        }
      }

      // 更新哈希
      this.lastConfigHash = newHash;

      this.logger.log(
        `Config reloaded: +${toAdd.length} servers, -${toRemove.length} servers`,
      );
    } catch (err) {
      this.logger.error(`Failed to reload config: ${(err as Error).message}`);
    }
  }

  /**
   * 加载并合并所有配置文件
   */
  private loadConfig(): MCPServerFileConfig {
    const projectRoot = process.cwd();
    const mergedConfig: MCPServerFileConfig = { mcpServers: [] };

    for (const configPath of this.configPaths) {
      const fullPath = path.join(projectRoot, configPath);

      if (fs.existsSync(fullPath)) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const config = JSON.parse(raw);

          // 后加载的配置覆盖先加载的
          if (config.mcpServers) {
            // 合并服务器配置
            const existingIds = new Set(mergedConfig.mcpServers.map((s) => s.id));

            for (const server of config.mcpServers) {
              const existingIndex = mergedConfig.mcpServers.findIndex(
                (s) => s.id === server.id,
              );

              if (existingIndex >= 0) {
                // 覆盖现有配置
                mergedConfig.mcpServers[existingIndex] = {
                  ...mergedConfig.mcpServers[existingIndex],
                  ...server,
                };
              } else if (!existingIds.has(server.id)) {
                // 添加新服务器
                mergedConfig.mcpServers.push(server);
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to load ${configPath}: ${(err as Error).message}`);
        }
      }
    }

    return mergedConfig;
  }

  /**
   * 计算配置哈希（用于检测变更）
   */
  private computeConfigHash(): string | null {
    const config = this.loadConfig();
    const content = JSON.stringify(config);

    // 简单哈希（生产环境应使用 crypto.createHash）
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }

  /**
   * 停止所有监听
   */
  private stopWatching() {
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch { /* ignore */ }
    }
    this.watchers = [];
  }

  /**
   * 手动触发配置重载（供 REST API 调用）
   */
  async reloadConfigManually(): Promise<{ added: number; removed: number }> {
    const currentServers = new Set(this.mcpManager.getConnectedServerIds());
    const newConfig = this.loadConfig();
    const newServers = new Set<string>(
      newConfig.mcpServers.filter((s) => s.enabled).map((s) => s.id),
    );

    const toAdd = [...newServers].filter((id) => !currentServers.has(id));
    const toRemove = [...currentServers].filter((id) => !newServers.has(id));

    for (const serverId of toAdd) {
      const config = newConfig.mcpServers.find((s) => s.id === serverId);
      if (config) {
        try {
          await this.mcpManager.connectServer(config);
        } catch (err) {
          this.logger.error(`[${serverId}] Failed to connect: ${(err as Error).message}`);
        }
      }
    }

    for (const serverId of toRemove) {
      try {
        await this.mcpManager.disconnectServer(serverId);
      } catch (err) {
        this.logger.error(`[${serverId}] Failed to disconnect: ${(err as Error).message}`);
      }
    }

    this.lastConfigHash = this.computeConfigHash();

    return { added: toAdd.length, removed: toRemove.length };
  }
}
