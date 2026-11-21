import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { SubagentRunsService } from './subagent-runs.service';
@Controller('api/runs')
export class SubagentRunsController {
  constructor(private readonly subagents: SubagentRunsService) {}
  @Post(':parentId/subagents')
  create(
    @Req() request: any,
    @Param('parentId') parentId: string,
    @Body() input: { toolCallId: string; agent: string; prompt: string },
  ) {
    if (!request.user?.dbId) throw new UnauthorizedException();
    return this.subagents.create(parentId, request.user.dbId, input);
  }

  @Get(':runId/team')
  team(@Req() request: any, @Param('runId') runId: string) {
    if (!request.user?.dbId) throw new UnauthorizedException();
    return this.subagents.team(runId, request.user.dbId);
  }

  @Post(':runId/team/messages')
  message(@Req() request: any, @Param('runId') runId: string, @Body() input: { recipientId: string; message: string; messageId?: string }) {
    if (!request.user?.dbId) throw new UnauthorizedException();
    return this.subagents.sendTeamMessage(runId, request.user.dbId, input);
  }
}
