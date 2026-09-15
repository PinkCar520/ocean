import { Module } from '@nestjs/common';
import { WorkService } from './work.service';
import { WorkController } from './work.controller';

/** WorkModule —— Phase 6 6d：Work 投影（项目 / 任务）。 */
@Module({
  controllers: [WorkController],
  providers: [WorkService],
  exports: [WorkService],
})
export class WorkModule {}
