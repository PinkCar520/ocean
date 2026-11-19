import {
  Body,
  Controller,
  Delete,
  Get,
  UnauthorizedException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { WorkspaceHostService } from './workspace-host.service';

@Controller('api/workspace-hosts')
export class WorkspaceHostController {
  constructor(private readonly hosts: WorkspaceHostService) {}

  @Get('account')
  account(@Req() req: any) {
    const accountId = req.user?.dbId;
    if (!accountId) throw new UnauthorizedException();
    return { accountId };
  }

  @Post('register')
  async register(@Body() body: unknown, @Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.hosts.register(userId, body) };
  }

  @Delete(':hostId')
  async revoke(@Param('hostId') hostId: string, @Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.hosts.revoke(userId, hostId) };
  }
}
