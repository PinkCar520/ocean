import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

interface UpdateWorkspaceBody {
  expectedRevision: number;
  configuration: unknown;
}

@Controller('api/workspaces')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  @Get()
  async list(@Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.workspaces.list(userId) };
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.workspaces.create(userId, body) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateWorkspaceBody,
    @Req() req: any,
  ) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.workspaces.update(
        userId,
        id,
        body.expectedRevision,
        body.configuration,
      ),
    };
  }

  @Delete(':id')
  async archive(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.dbId ?? req.user?.id;
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.workspaces.archive(userId, id) };
  }
}
