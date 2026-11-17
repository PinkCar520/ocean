import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Req,
  SetMetadata,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth/sso.guard';
import { MCPOAuthService } from './mcp-oauth.service';

@Controller('api/mcp-oauth')
export class MCPOAuthController {
  constructor(private readonly oauth: MCPOAuthService) {}
  private principal(request: any): string {
    if (typeof request.user?.dbId !== 'string' || !request.user.dbId)
      throw new UnauthorizedException();
    return request.user.dbId;
  }
  @Post(':serverId/authorize')
  authorize(@Req() request: any, @Param('serverId') serverId: string) {
    return this.oauth.authorize(this.principal(request), serverId);
  }
  @Get('callback')
  @SetMetadata(IS_PUBLIC_KEY, true)
  callback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Query('error') error?: string,
  ) {
    if (error) throw new BadRequestException('OAuth authorization denied');
    return this.oauth.callback(state, code);
  }
  @Delete(':serverId')
  disconnect(@Req() request: any, @Param('serverId') serverId: string) {
    return this.oauth.disconnect(this.principal(request), serverId);
  }
}
