import { Module } from '@nestjs/common';

import { ToolModule } from '../tool/tool.module';
import { RunController } from './run.controller';
import { ExternalApprovalController } from './external-approval.controller';
import { RunService } from './run.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [ToolModule], // ArtifactStore（artifact 读取端点依赖，Phase 4.8）
  controllers: [RunController, ExternalApprovalController],
  providers: [RunService, OutboxService],
  exports: [RunService, OutboxService],
})
export class RunModule {}
