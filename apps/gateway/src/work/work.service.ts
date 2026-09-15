import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SpaceService } from '../space/space.service';

export interface CreateProjectDto {
  name: string;
  description?: string;
  status?: 'active' | 'paused' | 'archived';
}

export interface CreateTaskDto {
  title: string;
  assigneeId?: string;
  dueAt?: string;
}

export interface UpdateTaskDto {
  status?: 'todo' | 'in_progress' | 'done' | 'blocked';
  assigneeId?: string;
}

/**
 * WorkService —— Phase 6 6d：Work 投影（项目 / 任务）。
 * 数据归属 Work Space（id='work'）。所有查询强制 spaceId='work'；
 * 跨 Space 读写被拒（与 Space 边界一致）。
 */
@Injectable()
export class WorkService {
  static readonly WORK_SPACE_ID = 'work';

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly spaceService: SpaceService,
  ) {}

  private async guard(userId: string) {
    await this.spaceService.requireAccessibleSpace(
      userId,
      WorkService.WORK_SPACE_ID,
    );
  }

  /** 总览：项目数、进行中任务、我的任务。 */
  async overview(userId: string) {
    await this.guard(userId);
    const [projectCount, inFlightTasks, myTasks] = await Promise.all([
      this.prisma.workProject.count({
        where: { spaceId: WorkService.WORK_SPACE_ID },
      }),
      this.prisma.workTask.count({
        where: {
          spaceId: WorkService.WORK_SPACE_ID,
          status: { in: ['todo', 'in_progress', 'blocked'] },
        },
      }),
      this.prisma.workTask.count({
        where: {
          spaceId: WorkService.WORK_SPACE_ID,
          assigneeId: userId,
          status: { not: 'done' },
        },
      }),
    ]);
    return { projectCount, inFlightTasks, myTasks };
  }

  /** 项目列表（含任务统计与最近任务）。 */
  async listProjects(userId: string) {
    await this.guard(userId);
    return this.prisma.workProject.findMany({
      where: { spaceId: WorkService.WORK_SPACE_ID },
      include: {
        _count: { select: { tasks: true } },
        tasks: {
          select: { id: true, title: true, status: true, assigneeId: true },
          orderBy: { updatedAt: 'desc' },
          take: 6,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 创建项目（强制归属 Work Space）。 */
  async createProject(userId: string, dto: CreateProjectDto) {
    await this.guard(userId);
    return this.prisma.workProject.create({
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status ?? 'active',
        ownerId: userId,
        spaceId: WorkService.WORK_SPACE_ID,
      },
    });
  }

  /** 项目任务列表。 */
  async listTasks(userId: string, projectId: string) {
    await this.guard(userId);
    const project = await this.prisma.workProject.findFirst({
      where: { id: projectId, spaceId: WorkService.WORK_SPACE_ID },
      select: { id: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return this.prisma.workTask.findMany({
      where: { projectId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  /** 创建任务（项目归属校验 + 强制 Work Space）。 */
  async createTask(userId: string, projectId: string, dto: CreateTaskDto) {
    await this.guard(userId);
    const project = await this.prisma.workProject.findFirst({
      where: { id: projectId, spaceId: WorkService.WORK_SPACE_ID },
      select: { id: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return this.prisma.workTask.create({
      data: {
        projectId,
        title: dto.title,
        assigneeId: dto.assigneeId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        spaceId: WorkService.WORK_SPACE_ID,
      },
    });
  }

  /** 更新任务（状态流转/改派）。 */
  async updateTask(userId: string, taskId: string, dto: UpdateTaskDto) {
    await this.guard(userId);
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, spaceId: WorkService.WORK_SPACE_ID },
      select: { id: true },
    });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    return this.prisma.workTask.update({
      where: { id: taskId },
      data: {
        status: dto.status,
        assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId,
      },
    });
  }
}
