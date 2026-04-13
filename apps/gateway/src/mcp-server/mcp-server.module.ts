import { Module } from '@nestjs/common';
import { MCPServerController } from './mcp-server.controller';
import { MCPServerService } from './mcp-server.service';
import { MCPHealthScheduler } from './mcp-health.scheduler';
import { MCPResourcesController } from './mcp-resources.controller';
import { MCPModule } from '../mcp/mcp.module';
import { MCPConfigWatcher } from '../mcp/mcp-config.watcher';

@Module({
  imports: [MCPModule],
  controllers: [MCPServerController, MCPResourcesController],
  providers: [MCPServerService, MCPHealthScheduler, MCPConfigWatcher],
  exports: [MCPServerService, MCPConfigWatcher, MCPModule],
})
export class MCPServerModule {}
