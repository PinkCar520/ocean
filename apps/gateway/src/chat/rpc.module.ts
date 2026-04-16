import { Module } from '@nestjs/common';
import { RpcGateway } from './rpc.gateway';
import { ApprovalModule } from '../skill/approval.module';
import { OrchestratorService } from './orchestrator.service';

/**
 * RpcModule
 *
 * 将 RpcGateway（Socket.io CLI 代理）提取为独立模块，
 * 避免 ChatModule ↔ SkillModule 循环依赖。
 * 同时被 ChatModule 和 SkillModule 导入。
 */
@Module({
  imports: [ApprovalModule],
  providers: [RpcGateway, OrchestratorService],
  exports: [RpcGateway, OrchestratorService],
})
export class RpcModule {}
