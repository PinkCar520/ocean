import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(
    @Inject('PRISMA_CLIENT') private prisma: PrismaClient,
  ) {}

  /**
   * 影子用户同步 (Shadow User Sync)
   * 当用户通过 SSO 登录时，自动在本地数据库维护一个记录
   */
  async syncUserFromSso(workId: string, name?: string) {
    if (!workId || workId === 'Guest') return null;

    return this.prisma.user.upsert({
      where: { workId },
      update: {
        name: name || undefined,
        updatedAt: new Date(),
      },
      create: {
        workId,
        name: name || workId,
        // 初始化默认偏好
        preferences: {
          create: {
            defaultModel: 'deepseek-v3',
            language: 'zh-CN',
          },
        },
      },
      include: {
        preferences: true,
      }
    });
  }

  /**
   * 获取用户完整的平台资产（偏好、凭证、会话）
   */
  async getUserFullProfile(workId: string) {
    return this.prisma.user.findUnique({
      where: { workId },
      include: {
        preferences: true,
        credentials: true,
      },
    });
  }
}
