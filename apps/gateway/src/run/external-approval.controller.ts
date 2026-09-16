import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { RunService } from './run.service';

/**
 * 外部审批端点（CLI 本地执行 ↔ Web 对话窗口审批）。
 * 审批统一存 RunApproval（runId 可空）：Web 面板轮询 pending 展示审批卡片，
 * CLI 轮询单条状态等待用户在对话窗口批准/拒绝。
 */
@Controller('api/approvals')
export class ExternalApprovalController {
  constructor(private readonly runService: RunService) {}

  /** POST /api/approvals —— CLI 本地执行触发需要审批的工具时创建外部审批。 */
  @Post()
  create(@Body() body: any, @Req() request: any) {
    return this.runService.createExternalApproval(
      this.userId(request),
      {
        toolName: body?.toolName,
        args: body?.args ?? {},
        sessionId: body?.sessionId,
      },
    );
  }

  /** GET /api/approvals/pending —— Web 对话窗口审批面板轮询当前用户待审批。 */
  @Get('pending')
  pending(@Req() request: any) {
    return this.runService.listPendingApprovals(this.userId(request));
  }

  /** GET /api/approvals/:id —— CLI 轮询审批结果。 */
  @Get(':id')
  get(@Param('id') id: string, @Req() request: any) {
    return this.runService.getExternalApproval(id, this.userId(request));
  }

  /** POST /api/approvals/:id/decide —— Web 对话窗口批准/拒绝（body.decision: approved|rejected）。 */
  @Post(':id/decide')
  decide(
    @Param('id') id: string,
    @Body() body: any,
    @Req() request: any,
  ) {
    const decision = body?.decision;
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new NotFoundException(`Invalid decision: ${decision}`);
    }
    return this.runService.decideExternalApproval(
      id,
      this.userId(request),
      decision,
    );
  }

  private userId(request: any): string {
    const userId = request.user?.dbId;
    if (!userId)
      throw new UnauthorizedException(
        'Authenticated database user is required',
      );
    return userId;
  }
}
