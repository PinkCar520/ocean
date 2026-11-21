import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { SpaceService } from '../space/space.service';
import { workspaceSnapshotSchema } from '@ocean/contracts';

export interface CreateMessageDto {
  role: 'user' | 'assistant' | 'system';
  content: string;
  parentId?: string | null;
  parts?: any;
  attachments?: any;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

@Injectable()
export class SessionService {
  constructor(
    @Inject('PRISMA_CLIENT') private prisma: PrismaClient,
    private readonly spaceService: SpaceService,
  ) {}

  // ── Session CRUD ──────────────────────────────────────────────
  // Phase 5：会话归属 Space。所有查询强制 spaceId 范围；
  // 客户端当前无 Space 概念，默认解析到 Work Space。

  async getSessions(
    userId: string,
    spaceId = SpaceService.DEFAULT_WORK_SPACE_ID,
  ) {
    await this.spaceService.assertAccess(userId, spaceId);
    const sessions = await this.prisma.session.findMany({
      where: { userId, status: 'active', spaceId },
      select: {
        id: true,
        title: true,
        channel: true,
        status: true,
        activeSkillId: true,
        pinned: true,
        projectId: true,
        spaceId: true,
        workspacePath: true,
        workspaceSnapshot: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      channel: s.channel,
      status: s.status,
      activeSkillId: s.activeSkillId,
      pinned: s.pinned,
      projectId: s.projectId,
      spaceId: s.spaceId,
      workspacePath: s.workspacePath,
      workspaceSnapshot: s.workspaceSnapshot,
      messageCount: s._count.messages,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    }));
  }

  async createSession(
    userId: string,
    channel = 'web',
    title = 'New Chat',
    activeSkillId?: string,
    spaceId = SpaceService.DEFAULT_WORK_SPACE_ID,
    workspacePath?: string,
    workspaceSnapshot?: unknown,
  ) {
    await this.spaceService.requireAccessibleSpace(userId, spaceId);
    let parsedWorkspaceSnapshot:
      | ReturnType<typeof workspaceSnapshotSchema.parse>
      | undefined;
    let workspaceId: string | undefined;
    if (workspacePath !== undefined) {
      if (spaceId !== SpaceService.DEFAULT_WORK_SPACE_ID) {
        throw new BadRequestException(
          'A local workspace folder can only be attached to a Work session',
        );
      }
      if (
        typeof workspacePath !== 'string' ||
        workspacePath.trim().length === 0 ||
        workspacePath.length > 4096 ||
        workspacePath.includes('\0')
      ) {
        throw new BadRequestException('Invalid workspace path');
      }
    }
    if (workspaceSnapshot !== undefined) {
      if (spaceId !== SpaceService.DEFAULT_WORK_SPACE_ID) {
        throw new BadRequestException(
          'A local workspace can only be attached to a Work session',
        );
      }
      const parsed = workspaceSnapshotSchema.safeParse(workspaceSnapshot);
      if (!parsed.success) {
        throw new BadRequestException(
          `Invalid workspace snapshot: ${parsed.error.issues[0]?.message ?? 'invalid data'}`,
        );
      }
      parsedWorkspaceSnapshot = parsed.data;
      const workspace = await this.prisma.workspace.findFirst({
        where: {
          id: parsed.data.workspaceId,
          userId,
          status: 'active',
        },
      });
      if (!workspace) {
        throw new NotFoundException(
          `Workspace ${parsed.data.workspaceId} not found`,
        );
      }
      const snapshotConfiguration = {
        name: parsed.data.name,
        hostId: parsed.data.hostId,
        platform: parsed.data.platform,
        roots: parsed.data.roots,
        cwd: parsed.data.cwd,
        worktree: parsed.data.worktree,
      };
      const storedConfiguration = {
        name: workspace.name,
        hostId: workspace.hostId,
        platform: workspace.platform,
        roots: workspace.roots,
        cwd: workspace.cwd,
        worktree: workspace.worktree,
      };
      if (
        workspace.revision !== parsed.data.workspaceRevision ||
        !isDeepStrictEqual(snapshotConfiguration, storedConfiguration)
      ) {
        throw new ConflictException(
          'Workspace changed since it was selected; refresh its Session snapshot',
        );
      }
      workspaceId = workspace.id;
      const primaryRoot = parsed.data.roots.find(
        (root) => root.role === 'primary',
      );
      if (workspacePath !== undefined && primaryRoot?.path !== workspacePath) {
        throw new BadRequestException(
          'Workspace path must match the snapshot primary root',
        );
      }
      workspacePath = primaryRoot?.path;
    }
    return this.prisma.session.create({
      data: {
        userId,
        channel,
        title,
        status: 'active',
        activeSkillId,
        spaceId,
        workspacePath,
        workspaceId,
        workspaceSnapshot: parsedWorkspaceSnapshot,
      },
    });
  }

  async getSessionById(id: string, userId: string, spaceId?: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, userId, ...(spaceId ? { spaceId } : {}) },
    });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return session;
  }

  async forkSession(id: string, userId: string, messageId?: string) {
    const source = await this.getSessionById(id, userId);
    await this.spaceService.requireAccessibleSpace(userId, source.spaceId);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.message.findMany({
        where: { sessionId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const byId = new Map(rows.map(row => [row.id, row]));
      const branch: typeof rows = [];
      const visited = new Set<string>();
      let message = messageId === undefined ? rows.at(-1) : byId.get(messageId);
      if (messageId !== undefined && !message) throw new NotFoundException('Fork message not found in this session.');
      while (message) {
        if (visited.has(message.id)) throw new ConflictException('Session history contains a cycle.');
        visited.add(message.id);
        branch.push(message);
        message = message.parentId ? byId.get(message.parentId) : undefined;
      }

      const fork = await tx.session.create({ data: {
        userId, spaceId: source.spaceId, title: source.title, channel: 'cli',
      } });
      let parentId: string | null = null;
      const messages = branch.reverse().map(row => {
        const id = randomUUID();
        const data = {
          id, parentId, sessionId: fork.id, role: row.role, content: row.content,
          parts: row.parts === null ? Prisma.DbNull : row.parts,
          attachments: row.attachments === null ? Prisma.DbNull : row.attachments,
          usage: row.usage === null ? Prisma.DbNull : row.usage,
          createdAt: row.createdAt,
        };
        parentId = id;
        return data;
      });
      if (messages.length) await tx.message.createMany({ data: messages });
      return fork;
    });
  }

  async getProjectChoices(id: string, userId: string) {
    const session = await this.assertOwnership(id, userId);
    return this.prisma.knowledgeProject.findMany({
      where: { spaceId: session.spaceId, OR: [{ isPublic: true }, { userId }] },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateSession(
    id: string,
    userId: string,
    data: { title?: string; status?: string; activeSkillId?: string; pinned?: boolean; projectId?: string | null },
  ) {
    const session = await this.assertOwnership(id, userId);
    if (data.projectId) {
      const project = await this.prisma.knowledgeProject.findFirst({
        where: {
          id: data.projectId,
          spaceId: session.spaceId,
          OR: [{ isPublic: true }, { userId }],
        },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project is unavailable in this session space');
    }
    return this.prisma.session.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async deleteSession(id: string, userId: string) {
    await this.assertOwnership(id, userId);
    // messages 因 onDelete: Cascade 自动级联删除
    await this.prisma.session.delete({ where: { id } });
    return { success: true };
  }

  async deleteAllSessions(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
    return { success: true };
  }

  // ── Message CRUD ──────────────────────────────────────────────

  /**
   * 追加单条消息到会话（流式完成后由 ChatService 调用）
   * @returns 创建的消息 ID（用于关联 CapsuleSnapshot）
   */
  async addMessage(sessionId: string, dto: CreateMessageDto): Promise<string> {
    // 如果没有显式提供 parentId，尝试找到该会话的最后一条消息作为父节点
    let parentId = dto.parentId;
    if (parentId === undefined) {
      const lastMsg = await this.prisma.message.findFirst({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      parentId = lastMsg?.id;
    }

    const created = await this.prisma.message.create({
      data: {
        sessionId,
        parentId: parentId ?? undefined,
        role: dto.role,
        content: dto.content,
        parts: dto.parts ?? undefined,
        attachments: dto.attachments ?? undefined,
        usage: dto.usage ?? undefined,
      },
    });

    // 更新会话的 updatedAt，让列表排序正确
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return created.id;
  }

  /**
   * 获取会话的所有消息 — 刷新恢复的关键接口
   */
  async getMessages(sessionId: string, userId: string) {
    // 先鉴权：确认该会话属于当前用户
    await this.assertOwnership(sessionId, userId);

    const rows = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }, // 改为按时间升序，前端负责根据 parentId 构建树
    });

    // 转换为 Vercel AI SDK UIMessage 格式，前端 useChat 可直接消费
    return rows.map((row) => ({
      id: row.id,
      parentId: row.parentId ?? undefined,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content,
      parts: row.parts ?? undefined,
      experimental_attachments: row.attachments ?? undefined,
      usage: row.usage ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  /**
   * 删除会话内所有消息（重新生成时使用）
   */
  async clearMessages(sessionId: string, userId: string): Promise<void> {
    await this.assertOwnership(sessionId, userId);
    await this.prisma.message.deleteMany({ where: { sessionId } });
  }

  // ── Internal ──────────────────────────────────────────────────

  private async assertOwnership(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, spaceId: true },
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.userId !== userId) {
      throw new ForbiddenException(
        `Session ${sessionId} does not belong to current user`,
      );
    }
    return session;
  }
}
