import { Module } from '@nestjs/common';
import { MCPClientManager } from './mcp-client.manager';

/**
 * MCPModule
 *
 * 将 MCPClientManager 作为全局单例 Provider 注入，
 * 供 ChatModule 使用聚合后的工具集。
 */
@Module({
  providers: [MCPClientManager],
  exports: [MCPClientManager],
})
export class MCPModule {}
