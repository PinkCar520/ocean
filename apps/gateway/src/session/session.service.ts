import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class SessionService {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  // 1. 获取会话列表摘要
  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        channel: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // 2. 获取单个会话详情
  async getSessionById(id: string, userId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, userId },
    });
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }
    return session;
  }

  // 3. 创建/更新会话 (UPSERT)
  async upsertSession(id: string, userId: string, data: any) {
    const channel = data.channel || 'web';
    const history = data.history || [];
    const title = data.title || 'New Chat';

    // Attempt to upsert
    return this.prisma.session.upsert({
      where: { id },
      create: {
        id,
        userId,
        title,
        channel,
        history,
      },
      update: {
        title,
        channel,
        history,
        updatedAt: new Date(), // Force update timestamp
      },
    });
  }

  // 4. 删除单个会话
  async deleteSession(id: string, userId: string) {
    // Check first to ensure ownership
    const session = await this.prisma.session.findFirst({
      where: { id, userId },
    });
    if (!session) {
      throw new NotFoundException(`Session ${id} not found or access denied`);
    }
    return this.prisma.session.delete({
      where: { id },
    });
  }
}
