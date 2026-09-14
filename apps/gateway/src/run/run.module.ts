import { Module } from '@nestjs/common';

import { RunController } from './run.controller';
import { RunService } from './run.service';
import { OutboxService } from './outbox.service';

@Module({
  controllers: [RunController],
  providers: [RunService, OutboxService],
  exports: [RunService, OutboxService],
})
export class RunModule {}
