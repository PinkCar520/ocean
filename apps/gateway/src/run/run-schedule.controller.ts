import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { RunScheduleService } from './run-schedule.service';

@Controller('api/run-schedules')
export class RunScheduleController {
  constructor(private readonly schedules: RunScheduleService) {}

  @Get()
  list(@Req() request: { user?: { dbId?: string } }) {
    return this.schedules.list(this.userId(request));
  }

  @Post()
  create(@Req() request: { user?: { dbId?: string } }, @Body() body: unknown) {
    return this.schedules.create(this.userId(request), body);
  }

  @Delete(':id')
  disable(@Req() request: { user?: { dbId?: string } }, @Param('id') id: string) {
    return this.schedules.disable(this.userId(request), id);
  }

  private userId(request: { user?: { dbId?: string } }): string {
    if (!request.user?.dbId) throw new UnauthorizedException();
    return request.user.dbId;
  }
}
