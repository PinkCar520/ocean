import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Phase 7 7a：运行指标——全局横切服务。
 * 提供 MetricsService（OTel Meter + 进程内快照 + /api/metrics），
 * 供 RunService / RunRunner / ToolExecutor / OutboxService 注入。
 */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
