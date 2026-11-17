import { Body, Controller, Put, Req, UnauthorizedException } from '@nestjs/common';
import { MCPCredentialsService } from './mcp-credentials.service';

@Controller('api/mcp-credentials')
export class MCPCredentialsController {
 constructor(private readonly credentials: MCPCredentialsService) {}

 @Put('environment')
 replace(@Req() request: any, @Body() body: Record<string, string>) {
  const userId = request.user?.dbId;
  if (typeof userId !== 'string' || !userId) throw new UnauthorizedException('Authenticated database user is required');
  return this.credentials.replace(userId, body);
 }
}
