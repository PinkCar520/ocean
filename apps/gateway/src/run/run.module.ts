import { RunScheduleController } from './run-schedule.controller';
import { RunScheduleService } from './run-schedule.service';
import { SubagentRunsService } from './subagent-runs.service';
import { SubagentRunsController } from './subagent-runs.controller';
import { ApprovalMaintenanceService } from './approval-maintenance.service';
import { Module } from '@nestjs/common';

import { ToolModule } from '../tool/tool.module';
import { RunController } from './run.controller';
import { ExternalApprovalController } from './external-approval.controller';
import { RunService } from './run.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [ToolModule], // ArtifactStore（artifact 读取端点依赖，Phase 4.8）
  controllers: [RunScheduleController, SubagentRunsController, RunController, ExternalApprovalController],
  providers: [RunScheduleService, SubagentRunsService, RunService, OutboxService, ApprovalMaintenanceService],
  exports: [RunScheduleService, SubagentRunsService, RunService, OutboxService],
})
export class RunModule {}
