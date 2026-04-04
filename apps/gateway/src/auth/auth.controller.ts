import { Controller, Post, Body, UnauthorizedException, Req, Headers, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/register
   * 用户注册接口
   */
  @Post('register')
  async register(@Body() body: any) {
    const { email, password, name } = body;
    if (!email || !password) {
      throw new UnauthorizedException('Authentication Failed: Email and password are required.');
    }
    return this.authService.register(email, password, name);
  }

  /**
   * POST /api/auth/login
   * 用户登录接口
   */
  @Post('login')
  async login(@Body() body: any) {
    const { username, email, password } = body;
    const identifier = username || email;
    
    if (!identifier || !password) {
      throw new UnauthorizedException('Authentication Failed: Credentials required.');
    }

    const user = await this.authService.validateUser(identifier, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.authService.login(user);
  }
}
