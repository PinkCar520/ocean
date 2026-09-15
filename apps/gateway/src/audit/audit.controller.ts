import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * AuditController —— Phase 7 7b：审计查询入口。
 * GET /api/audit?spaceId=&limit=  —— 当前用户在指定/全部可访问 Space 的操作日志。
 */
@Controller('api/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(@Query() query: any, @Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    const limit = query.limit ? Number(query.limit) : undefined;
    return {
      success: true,
      data: await this.auditService.list(userId, { spaceId: query.spaceId, limit }),
    };
  }
}
