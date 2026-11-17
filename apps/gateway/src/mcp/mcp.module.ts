import { MCPOAuthService } from './mcp-oauth.service';
import { MCPOAuthController } from './mcp-oauth.controller';
import { MCPCredentialsController } from './mcp-credentials.controller';
import { MCPCredentialsService } from './mcp-credentials.service';
import { Module, forwardRef } from '@nestjs/common';
import { MCPClientManager } from './mcp-client.manager';
import { MCPConfigLoader } from './mcp-config.loader';
import { MCPClientPool } from './mcp-client.pool';
import { RpcModule } from '../chat/rpc.module';

/**
 * MCPModule
 *
 * 将 MCPClientManager 作为全局单例 Provider 注入，
 * 供 ChatModule 使用聚合后的工具集。
 * MCPConfigLoader 提供多层级配置加载能力。
 */
@Module({
  imports: [forwardRef(() => RpcModule)],
  controllers: [MCPCredentialsController, MCPOAuthController],
  providers: [MCPOAuthService, MCPCredentialsService, MCPClientManager, MCPConfigLoader, MCPClientPool],
  exports: [MCPClientManager, MCPConfigLoader, MCPClientPool],
})
export class MCPModule {}
