import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UnauthorizedException,
  Req,
  Res,
  SetMetadata,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ApiKeyService, CreateApiKeyDto } from './api-key.service';
import { IS_PUBLIC_KEY } from './sso.guard';
import { OCEAN_SESSION_COOKIE, OCEAN_SESSION_MAX_AGE_MS } from './auth-cookie';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /**
   * POST /api/auth/register
   * 用户注册接口
   */
  @Public()
  @Post('register')
  async register(
    @Body() body: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { email, password, name } = body;
    if (!email || !password) {
      throw new UnauthorizedException(
        'Authentication Failed: Email and password are required.',
      );
    }
    const result = await this.authService.register(email, password, name);
    this.setSessionCookie(response, result.access_token);
    return result;
  }

  /**
   * POST /api/auth/login
   * 用户登录接口
   */
  @Public()
  @Post('login')
  async login(
    @Body() body: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { username, email, password } = body;
    const identifier = username || email;

    if (!identifier || !password) {
      throw new UnauthorizedException(
        'Authentication Failed: Credentials required.',
      );
    }

    const user = await this.authService.validateUser(identifier, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const result = await this.authService.login(user);
    this.setSessionCookie(response, result.access_token);
    return result;
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(OCEAN_SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return { success: true };
  }

  /**
   * POST /api/auth/api-keys
   * 创建 API Key（用户登录后使用）
   */
  @Post('api-keys')
  async createApiKey(@Req() req: any, @Body() body: CreateApiKeyDto) {
    const userId = req.user?.dbId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required.');
    }
    return this.apiKeyService.createApiKey(userId, body);
  }

  /**
   * GET /api/auth/api-keys
   * 列出当前用户的所有 API Key
   */
  @Get('api-keys')
  async listApiKeys(@Req() req: any) {
    const userId = req.user?.dbId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required.');
    }
    return this.apiKeyService.listApiKeys(userId);
  }

  /**
   * DELETE /api/auth/api-keys/:id
   * 撤销 API Key
   */
  @Delete('api-keys/:id')
  async revokeApiKey(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.dbId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required.');
    }
    return this.apiKeyService.revokeApiKey(userId, id);
  }

  private setSessionCookie(response: Response, token: string) {
    response.cookie(OCEAN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: OCEAN_SESSION_MAX_AGE_MS,
    });
  }
}
