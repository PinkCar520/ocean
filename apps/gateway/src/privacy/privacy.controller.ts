import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { PrivacyService } from './privacy.service';

/**
 * PrivacyController —— Phase 7 7c：数据导出 / 账号删除。
 * - GET  /api/privacy/export          本人数据 JSON 导出
 * - POST /api/privacy/delete-account  { confirm: 'DELETE' } 级联删除本人账号
 */
@Controller('api/privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('export')
  async exportData(@Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.privacyService.exportData(userId),
    };
  }

  @Post('delete-account')
  async deleteAccount(@Body() body: any, @Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return this.privacyService.deleteAccount(userId, body?.confirm);
  }
}
