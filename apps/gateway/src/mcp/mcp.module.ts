import { Module } from '@nestjs/common';
import { MCPClientManager } from './mcp-client.manager';
import { MCPConfigLoader } from './mcp-config.loader';

/**
 * MCPModule
 *
 * 将 MCPClientManager 作为全局单例 Provider 注入，
 * 供 ChatModule 使用聚合后的工具集。
 * MCPConfigLoader 提供多层级配置加载能力。
 */
@Module({
  providers: [MCPClientManager, MCPConfigLoader],
  exports: [MCPClientManager, MCPConfigLoader],
})
export class MCPModule {}
