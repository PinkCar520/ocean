import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA_CLIENT') private prisma: PrismaClient,
    private jwtService: JwtService,
  ) {}

  /**
   * 注册新用户
   */
  async register(email: string, password: string, name?: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { workId: email }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists with this email or ID.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const workId = `WB-${Math.floor(1000 + Math.random() * 9000)}`;

    const user = await this.prisma.user.create({
      data: {
        email,
        workId,
        name: name || email.split('@')[0],
        password: hashedPassword,
        preferences: {
          create: {
            defaultModel: 'deepseek-v3',
            language: 'zh-CN',
          },
        },
      },
    });

    return this.login(user);
  }

  /**
   * 登录验证
   */
  async login(user: any) {
    const payload = { 
      sub: user.id, 
      workId: user.workId, 
      email: user.email,
      name: user.name 
    };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        workId: user.workId,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }

  /**
   * 验证用户凭证 (用于登录)
   */
  async validateUser(identifier: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { workId: identifier }],
      },
    });

    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }
}
