import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Post, Req, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { IS_PUBLIC_KEY } from '../auth/sso.guard';
import { ConversationShareService } from './conversation-share.service';

const publishSchema = z.object({ leafId: z.string().uuid() }).strict();
const recipientSchema = z.object({ identifier: z.string().trim().min(1).max(254) }).strict();
const inviteSchema = z.object({
  recipientId: z.string().uuid(),
  leafId: z.string().uuid(),
}).strict();

type AuthenticatedRequest = { user?: { dbId?: string } };

@Controller('api')
export class ConversationShareController {
  constructor(private readonly shares: ConversationShareService) {}

  private userId(req: AuthenticatedRequest) {
    if (!req.user?.dbId) throw new UnauthorizedException();
    return req.user.dbId;
  }

  @Get('sessions/:sessionId/shares')
  @Header('Cache-Control', 'private, no-store')
  async list(@Param('sessionId') sessionId: string, @Req() req: AuthenticatedRequest) {
    return { success: true, ...await this.shares.list(sessionId, this.userId(req)) };
  }

  @Post('sessions/:sessionId/share-recipient')
  @Header('Cache-Control', 'private, no-store')
  async findRecipient(@Param('sessionId') sessionId: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = recipientSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid account.');
    return { success: true, data: await this.shares.findRecipient(sessionId, this.userId(req), parsed.data.identifier) };
  }

  @Post('sessions/:sessionId/shares')
  async invite(@Param('sessionId') sessionId: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid invitation.');
    const { recipientId, leafId } = parsed.data;
    return { success: true, data: await this.shares.invite(sessionId, this.userId(req), recipientId, leafId) };
  }

  @Delete('sessions/:sessionId/shares/:id')
  async revoke(@Param('sessionId') sessionId: string, @Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.shares.revoke(sessionId, this.userId(req), id);
    return { success: true };
  }

  @Post('sessions/:sessionId/public-share')
  @Header('Cache-Control', 'private, no-store')
  async publish(@Param('sessionId') sessionId: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid conversation branch.');
    return { success: true, data: await this.shares.publish(sessionId, this.userId(req), parsed.data.leafId) };
  }

  @Delete('sessions/:sessionId/public-share')
  async unpublish(@Param('sessionId') sessionId: string, @Req() req: AuthenticatedRequest) {
    await this.shares.unpublish(sessionId, this.userId(req));
    return { success: true };
  }

  @Get('public-conversation-shares/:id')
  @SetMetadata(IS_PUBLIC_KEY, true)
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async readPublic(@Param('id') id: string) {
    return { success: true, data: await this.shares.readPublic(id) };
  }

  @Get('conversation-shares/:id/original')
  @Header('Cache-Control', 'private, no-store')
  async originalSession(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return { data: await this.shares.originalSession(id, this.userId(req)) };
  }

  @Get('conversation-shares/:id')
  @Header('Cache-Control', 'private, no-store')
  async read(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.shares.read(id, this.userId(req)) };
  }
}
