import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Phase 7 7b：审计日志——全局横切服务。
 * 提供 AuditService（tool.execute / grant.created / grant.revoked 记录 + 查询），
 * 供 SpaceService / ToolExecutor / RunService 等任意模块注入。
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
