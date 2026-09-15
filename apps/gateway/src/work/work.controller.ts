import { Controller, Get, Post, Patch, Body, Param, Req } from '@nestjs/common';
import { WorkService } from './work.service';

/** WorkController —— Phase 6 6d：Work 投影 API（项目 / 任务）。 */
@Controller('api/work')
export class WorkController {
  constructor(private readonly workService: WorkService) {}

  private userId(req: any): string {
    return req.user?.dbId ?? req.user?.id;
  }

  @Get('overview')
  async overview(@Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.workService.overview(userId) };
  }

  @Get('projects')
  async listProjects(@Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.workService.listProjects(userId) };
  }

  @Post('projects')
  async createProject(@Body() body: any, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.workService.createProject(userId, {
        name: body.name,
        description: body.description,
        status: body.status,
      }),
    };
  }

  @Get('projects/:id/tasks')
  async listTasks(@Param('id') id: string, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.workService.listTasks(userId, id),
    };
  }

  @Post('projects/:id/tasks')
  async createTask(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.workService.createTask(userId, id, {
        title: body.title,
        assigneeId: body.assigneeId,
        dueAt: body.dueAt,
      }),
    };
  }

  @Patch('tasks/:id')
  async updateTask(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.workService.updateTask(userId, id, {
        status: body.status,
        assigneeId: body.assigneeId,
      }),
    };
  }
}
