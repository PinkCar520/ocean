import { BadRequestException, Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { createRunRequestSchema } from '@ocean/contracts';

import { RunService } from './run.service';

@Controller('api/runs')
export class RunController {
  constructor(private readonly runService: RunService) {}

  @Post()
  create(@Body() body: unknown, @Req() request: any) {
    const parsed = createRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid run request', issues: parsed.error.issues });
    }
    return this.runService.create(this.userId(request), parsed.data);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() request: any) {
    return this.runService.get(id, this.userId(request));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() request: any) {
    return this.runService.cancel(id, this.userId(request));
  }

  private userId(request: any): string {
    const userId = request.user?.dbId;
    if (!userId) throw new UnauthorizedException('Authenticated database user is required');
    return userId;
  }
}
