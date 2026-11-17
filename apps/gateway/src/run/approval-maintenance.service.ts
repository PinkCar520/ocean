import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ApprovalMaintenanceService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private active = false;
  private readonly logger = new Logger(ApprovalMaintenanceService.name);
  constructor(@Inject('PRISMA_CLIENT') private readonly db: PrismaClient) {}
  async sweep() {
    const days = Number(process.env.OCEAN_APPROVAL_RETENTION_DAYS ?? 30);
    if (!Number.isFinite(days) || days < 1 || days > 3650)
      throw new Error('Invalid approval retention days');
    const now = new Date();
    const expired = await this.db.runApproval.updateMany({
      where: { scope: 'session', status: 'approved', expiresAt: { lte: now } },
      data: { status: 'expired' },
    });
    const deleted = await this.db.runApproval.deleteMany({
      where: {
        status: { in: ['expired', 'superseded'] },
        updatedAt: { lt: new Date(now.getTime() - days * 86400000) },
      },
    });
    return { expired: expired.count, deleted: deleted.count };
  }
  async onModuleInit() {
    await this.sweep();
    this.timer = setInterval(() => {
      if (this.active) return;
      this.active = true;
      void this.sweep()
        .catch(() => this.logger.error('Approval maintenance failed'))
        .finally(() => {
          this.active = false;
        });
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
