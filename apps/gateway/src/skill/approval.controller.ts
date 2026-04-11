import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { ApprovalService } from './approval.service';

@Controller('api/chat/approvals')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  /**
   * GET /api/chat/approvals/:sessionId
   * Get pending approvals for a session.
   */
  @Get(':sessionId')
  async getPending(@Param('sessionId') sessionId: string) {
    const requests = await this.approvalService.getSessionPendingRequests(sessionId);
    return { success: true, data: requests };
  }

  /**
   * POST /api/chat/approvals/:requestId/respond
   * Respond to an approval request.
   */
  @Post(':requestId/respond')
  async respond(
    @Param('requestId') requestId: string,
    @Body() body: { status: 'approved' | 'denied' },
    @Req() req: any,
  ) {
    const userId = req.user?.workId || req.user?.dbId || 'anonymous';
    const { status } = body;

    const success = await this.approvalService.respondToRequest(requestId, status, userId);
    return {
      success,
      message: success ? `Request ${status}` : 'Request not found or already resolved',
    };
  }

  /**
   * GET /api/chat/approvals/:requestId/status
   * Check approval status (for polling from tool execution).
   */
  @Get(':requestId/status')
  async getStatus(@Param('requestId') requestId: string) {
    const status = await this.approvalService.getStatus(requestId);
    return { success: true, status };
  }
}
