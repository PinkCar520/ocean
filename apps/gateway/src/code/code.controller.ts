import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { CodeService } from './code.service';

/**
 * CodeController —— Phase 6 6c：Code 投影 API（仓库 / Diff / Review）。
 * 所有端点要求用户有 Code Space（id='code'）Membership。
 */
@Controller('api/code')
export class CodeController {
  constructor(private readonly codeService: CodeService) {}

  private userId(req: any): string {
    return req.user?.dbId ?? req.user?.id;
  }

  @Get('overview')
  async overview(@Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.codeService.overview(userId) };
  }

  @Get('repositories')
  async listRepositories(@Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.codeService.listRepositories(userId) };
  }

  @Post('repositories')
  async createRepository(@Body() body: any, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    const repo = await this.codeService.createRepository(userId, {
      name: body.name,
      url: body.url,
      path: body.path,
      defaultBranch: body.defaultBranch,
      description: body.description,
      provider: body.provider,
    });
    return { success: true, data: repo };
  }

  @Get('repositories/:id/diffs')
  async listDiffs(@Param('id') id: string, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.codeService.listDiffs(userId, id) };
  }

  @Get('terminals')
  async listTerminals(@Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.codeService.listTerminals(userId) };
  }

  @Post('terminals')
  async createTerminal(@Body() body: any, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.codeService.createTerminal(userId, {
        title: body.title,
        cwd: body.cwd,
        repositoryId: body.repositoryId,
      }),
    };
  }

  @Get('terminals/:id')
  async getTerminal(@Param('id') id: string, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return { success: true, data: await this.codeService.getTerminal(userId, id) };
  }

  @Post('terminals/:id/commands')
  async recordCommand(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    return {
      success: true,
      data: await this.codeService.recordCommand(userId, id, {
        input: body.input,
        output: body.output,
        exitCode: body.exitCode,
        durationMs: body.durationMs,
      }),
    };
  }

  @Post('diffs/:id/reviews')
  async decideReview(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const userId = this.userId(req);
    if (!userId) return { success: false, error: 'Unauthorized' };
    const review = await this.codeService.decideReview(userId, id, {
      status: body.status,
      comment: body.comment,
    });
    return { success: true, data: review };
  }
}
