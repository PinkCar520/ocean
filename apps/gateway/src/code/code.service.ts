import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SpaceService } from '../space/space.service';

export interface CreateRepositoryDto {
  name: string;
  url?: string;
  path?: string;
  defaultBranch?: string;
  description?: string;
  provider?: string;
}

export interface CreateReviewDto {
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  comment?: string;
}

/**
 * CodeService —— Phase 6 6c：Code 投影（仓库 / Diff / Review）。
 * 数据归属 Code Space（id='code'，种子创建，所有用户经 Membership 访问）。
 * 所有查询强制 spaceId='code'；跨 Space 读写被拒（与 Space 边界一致）。
 */
@Injectable()
export class CodeService {
  static readonly CODE_SPACE_ID = 'code';

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly spaceService: SpaceService,
  ) {}

  private async guard(userId: string) {
    await this.spaceService.requireAccessibleSpace(userId, CodeService.CODE_SPACE_ID);
  }

  /** 仓库列表（含 Diff/Review 统计）；调用方需有 Code Space 访问权。 */
  async listRepositories(userId: string) {
    await this.guard(userId);
    const repos = await this.prisma.codeRepository.findMany({
      where: { spaceId: CodeService.CODE_SPACE_ID },
      include: {
        _count: { select: { diffs: true } },
        diffs: {
          where: { status: 'open' },
          select: { id: true, title: true, headRef: true, status: true, _count: { select: { reviews: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return repos;
  }

  /** 创建仓库（强制归属 Code Space）。 */
  async createRepository(userId: string, data: CreateRepositoryDto) {
    await this.guard(userId);
    return this.prisma.codeRepository.create({
      data: {
        ...data,
        defaultBranch: data.defaultBranch ?? 'main',
        provider: data.provider ?? 'git',
        spaceId: CodeService.CODE_SPACE_ID,
      },
    });
  }

  /** 仓库 Diff 列表。 */
  async listDiffs(userId: string, repositoryId: string) {
    await this.guard(userId);
    const repo = await this.prisma.codeRepository.findFirst({
      where: { id: repositoryId, spaceId: CodeService.CODE_SPACE_ID },
      select: { id: true },
    });
    if (!repo) throw new NotFoundException(`Repository ${repositoryId} not found`);
    return this.prisma.codeDiff.findMany({
      where: { repositoryId },
      include: { reviews: { orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 对 Diff 提交 Review 决策（幂等：同 Diff 已审则更新）。 */
  async decideReview(userId: string, diffId: string, dto: CreateReviewDto) {
    await this.guard(userId);
    const diff = await this.prisma.codeDiff.findFirst({
      where: { id: diffId, repository: { spaceId: CodeService.CODE_SPACE_ID } },
      select: { id: true },
    });
    if (!diff) throw new NotFoundException(`Diff ${diffId} not found`);
    const existing = await this.prisma.codeReview.findFirst({
      where: { diffId, reviewerId: userId },
      select: { id: true },
    });
    if (existing) {
      return this.prisma.codeReview.update({
        where: { id: existing.id },
        data: { status: dto.status, comment: dto.comment, decidedAt: new Date() },
      });
    }
    return this.prisma.codeReview.create({
      data: { diffId, status: dto.status, reviewerId: userId, comment: dto.comment, decidedAt: new Date() },
    });
  }

  /** 总览：仓库数、待审 Diff、我的待审。 */
  async overview(userId: string) {
    await this.guard(userId);
    const [repoCount, openDiffs, myPending] = await Promise.all([
      this.prisma.codeRepository.count({ where: { spaceId: CodeService.CODE_SPACE_ID } }),
      this.prisma.codeDiff.count({
        where: { status: 'open', repository: { spaceId: CodeService.CODE_SPACE_ID } },
      }),
      this.prisma.codeDiff.count({
        where: {
          status: 'open',
          repository: { spaceId: CodeService.CODE_SPACE_ID },
          reviews: { none: { reviewerId: userId } },
        },
      }),
    ]);
    return { repoCount, openDiffs, myPending };
  }
}
