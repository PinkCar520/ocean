import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { OCEAN_SESSION_MAX_AGE_MS } from './auth-cookie';
import { resolveLoginLocation } from './login-location';

@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA_CLIENT') private prisma: PrismaClient,
    private jwtService: JwtService,
  ) {}

  /**
   * 注册新用户
   */
  async register(email: string, password: string, name?: string, userAgent?: string, ip?: string) {
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

    // Phase 5：新用户自动成为默认 Work Space owner（迁移种子只回填迁移时已存在用户）
    await this.prisma.membership.upsert({
      where: { spaceId_userId: { spaceId: 'work', userId: user.id } },
      create: { spaceId: 'work', userId: user.id, role: 'owner' },
      update: {},
    });

    return this.login(user, userAgent, ip);
  }

  /**
   * 登录验证
   */
  async login(user: any, userAgent?: string, ip?: string) {
    const sessionId = randomUUID();
    const payload = {
      jti: sessionId,
      sub: user.id,
      workId: user.workId,
      email: user.email,
      name: user.name,
    };

    const location = await resolveLoginLocation(ip);
    const token = this.jwtService.sign(payload);
    await this.prisma.loginSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        userAgent: userAgent?.slice(0, 512),
        location,
        expiresAt: new Date(Date.now() + OCEAN_SESSION_MAX_AGE_MS),
      },
    });

    return {
      access_token: token,
      user: {
        id: user.id,
        workId: user.workId,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }

  listLoginSessions(userId: string) {
    return this.prisma.loginSession.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userAgent: true, location: true, createdAt: true, lastActiveAt: true },
    });
  }

  async revokeLoginSession(userId: string, sessionId: string) {
    await this.prisma.loginSession.deleteMany({ where: { id: sessionId, userId } });
  }

  async endLoginSession(token?: string) {
    if (!token) return;

    let payload: { jti?: string; sub: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      return;
    }
    if (payload.jti) {
      await this.revokeLoginSession(payload.sub, payload.jti);
    }
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
