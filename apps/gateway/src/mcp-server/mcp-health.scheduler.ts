import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MCPServerService } from './mcp-server.service';

/**
 * MCP Server 健康检查定时任务
 * 每 5 分钟自动检查所有 MCP Server 的健康状态
 */
@Injectable()
export class MCPHealthScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MCPHealthScheduler.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(private mcpServerService: MCPServerService) {}

  onModuleInit() {
    this.logger.log('Starting MCP Server health check scheduler (every 5 min)...');
    // Run once after 10 seconds on startup
    setTimeout(() => this.runHealthCheck(), 10000);
    // Then every 5 minutes
    this.intervalId = setInterval(() => this.runHealthCheck(), this.CHECK_INTERVAL);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Stopped MCP Server health check scheduler.');
    }
  }

  private async runHealthCheck() {
    this.logger.debug('Running MCP Server health check...');
    try {
      const statuses = await this.mcpServerService.checkAllServers();
      const online = Object.values(statuses).filter((s) => s === 'online').length;
      const total = Object.keys(statuses).length;
      this.logger.log(`Health check complete: ${online}/${total} servers online`);
    } catch (err) {
      this.logger.error(`Health check failed: ${(err as Error).message}`);
    }
  }
}
