import { Module } from '@nestjs/common';
import { MCPServerController } from './mcp-server.controller';
import { MCPServerService } from './mcp-server.service';
import { MCPHealthScheduler } from './mcp-health.scheduler';

@Module({
  controllers: [MCPServerController],
  providers: [MCPServerService, MCPHealthScheduler],
  exports: [MCPServerService],
})
export class MCPServerModule {}
