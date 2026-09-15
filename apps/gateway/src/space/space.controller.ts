import { Controller, Get, Post, Req } from '@nestjs/common';
import { SpaceService } from './space.service';

/**
 * SpaceController —— Space 数据边界的用户入口（Phase 5）。
 * - GET  /api/spaces       当前用户可见的 Space 列表
 * - POST /api/spaces/life  幂等创建/获取本人 Life Space
 */
@Controller('api/spaces')
export class SpaceController {
  constructor(private readonly spaceService: SpaceService) {}

  @Get()
  async list(@Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.spaceService.listSpaces(userId) };
  }

  @Post('life')
  async ensureLife(@Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    const space = await this.spaceService.ensureLifeSpace(userId);
    return { success: true, data: space };
  }
}
