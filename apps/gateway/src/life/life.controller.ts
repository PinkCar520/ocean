import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
} from '@nestjs/common';
import { LifeService } from './life.service';

/** LifeController —— Phase 6 6e：Life 投影 API（个人记忆 / 隐私概览）。 */
@Controller('api/life')
export class LifeController {
  constructor(private readonly lifeService: LifeService) {}

  private userId(req: any): string {
    return req.user?.dbId ?? req.user?.id;
  }

  @Get('memories')
  async listMemories(@Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.lifeService.listMemories(userId) };
  }

  @Post('memories')
  async createMemory(@Body() body: any, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.lifeService.createMemory(userId, {
        content: body.content,
        tags: body.tags,
        type: body.type,
      }),
    };
  }

  @Delete('memories/:id')
  async deleteMemory(@Param('id') id: string, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.lifeService.deleteMemory(userId, id),
    };
  }

  @Get('privacy')
  async privacyOverview(@Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.lifeService.privacyOverview(userId),
    };
  }
}
