import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RunScheduleService } from '../run/run-schedule.service';

@Injectable()
export class RunScheduleDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunScheduleDispatcher.name);
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(private readonly schedules: RunScheduleService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.dispatching) return;
      this.dispatching = true;
      void this.schedules.dispatchDue()
        .catch(() => this.logger.error('Failed to dispatch queued Run schedules.'))
        .finally(() => { this.dispatching = false; });
    }, 15_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
