import { Module } from '@nestjs/common';
import { RpcGateway } from './rpc.gateway';
import { OrchestratorService } from './orchestrator.service';
import { AuthModule } from '../auth/auth.module';
import { DeviceRpcDispatcher } from './device-rpc.dispatcher';
import { WorkspaceModule } from '../workspace/workspace.module';

/**
 * RpcModule
 *
 * 将 RpcGateway（Socket.io CLI 代理）提取为独立模块，
 * 避免 ChatModule ↔ SkillModule 循环依赖。
 * 同时被 ChatModule 和 SkillModule 导入。
 */
@Module({
  imports: [AuthModule, WorkspaceModule],
  providers: [RpcGateway, OrchestratorService, DeviceRpcDispatcher],
  exports: [RpcGateway, OrchestratorService],
})
export class RpcModule {}
