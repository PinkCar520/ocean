import { Controller, Get, Param, Put, Body, Delete, Req } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('api/session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  async getSessions(@Req() req: any) {
    const userId = req.user?.dbId; // Use internal DB UUID for relations
    if (!userId) {
      throw new Error('User not properly authenticated');
    }
    const sessions = await this.sessionService.getSessions(userId);
    return { success: true, data: sessions };
  }

  @Get(':id')
  async getSessionById(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.dbId;
    const session = await this.sessionService.getSessionById(id, userId);
    return { success: true, data: session };
  }

  @Put(':id')
  async upsertSession(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const userId = req.user?.dbId;
    const session = await this.sessionService.upsertSession(id, userId, body);
    return { success: true, data: session };
  }

  @Delete(':id')
  async deleteSession(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.dbId;
    await this.sessionService.deleteSession(id, userId);
    return { success: true };
  }
}
