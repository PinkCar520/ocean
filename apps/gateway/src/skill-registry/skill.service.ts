import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SpaceService } from '../space/space.service';
import { AuditService } from '../audit/audit.service';

export interface CreateSkillDto {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  source?: string;
  sourceUrl?: string;
  version?: string;
  author?: string;
  license?: string;
  compatibility?: string;
  manifest?: any;
  content?: string;
  isFeatured?: boolean;
  isPublic?: boolean;
  icon?: string;
  tags?: string[];
  triggerKws?: string[];
}

export interface UpdateSkillDto {
  name?: string;
  description?: string;
  category?: string;
  version?: string;
  isFeatured?: boolean;
  isPublic?: boolean;
  icon?: string;
  tags?: string[];
  content?: string;
  triggerKws?: string[];
}

export interface InstallSkillDto {
  userId?: string;
  config?: any;
}

@Injectable()
export class SkillService {
  constructor(
    @Inject('PRISMA_CLIENT') private prisma: PrismaClient,
    private readonly spaceService: SpaceService,
    private readonly audit: AuditService,
  ) {}

  async getSkills(params?: {
    category?: string;
    source?: string;
    q?: string;
    isFeatured?: boolean;
  }) {
    const where: any = { isPublic: true };

    if (params?.category && params.category !== 'all') {
      where.category = params.category;
    }
    if (params?.source) {
      where.source = params.source;
    }
    if (params?.isFeatured) {
      where.isFeatured = true;
    }
    if (params?.q) {
      where.OR = [
        { name: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
        { tags: { has: params.q } },
      ];
    }

    const skills = await this.prisma.skill.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });

    return skills;
  }

  async getSkillById(id: string) {
    return this.prisma.skill.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  async getSkillBySlug(slug: string) {
    return this.prisma.skill.findUnique({ where: { slug } });
  }

  async createSkill(data: CreateSkillDto, userId?: string) {
    const { scope, ...prismaData } = data as any;
    const skill = await this.prisma.skill.create({
      data: {
        ...prismaData,
        userId: userId || null,
        tags: prismaData.tags || [],
        triggerKws: prismaData.triggerKws || [],
        isFeatured: prismaData.isFeatured ?? false,
        isPublic: prismaData.isPublic ?? true,
        source: prismaData.source || 'internal',
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });

    await this.prisma.skillVersion.create({
      data: {
        skillId: skill.id,
        userId: userId || null,
        name: skill.name,
        content: skill.content,
      },
    });

    return skill;
  }

  async updateSkill(id: string, data: UpdateSkillDto, userId?: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) throw new NotFoundException('Skill not found');

    if (skill.userId && skill.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this skill',
      );
    }

    const {
      scope,
      user,
      id: _id,
      createdAt,
      updatedAt,
      ...prismaData
    } = data as any;
    const updatedSkill = await this.prisma.skill.update({
      where: { id },
      data: prismaData,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });

    await this.prisma.skillVersion.create({
      data: {
        skillId: updatedSkill.id,
        userId: userId || null,
        name: updatedSkill.name,
        content: updatedSkill.content,
      },
    });

    return updatedSkill;
  }

  async deleteSkill(id: string, userId?: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) throw new NotFoundException('Skill not found');

    if (skill.userId && skill.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this skill',
      );
    }

    return this.prisma.skill.delete({ where: { id } });
  }

  async getSkillHistory(skillId: string) {
    return this.prisma.skillVersion.findMany({
      where: { skillId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });
  }

  async getStats() {
    const [total, newThisWeek] = await Promise.all([
      this.prisma.skill.count({ where: { isPublic: true } }),
      this.prisma.skill.count({
        where: {
          isPublic: true,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return { total, newThisWeek };
  }

  // ─── Skill Installation ─────────────────────────────────────────────
  // Phase 5：安装归属默认 Work Space（客户端当前无 Space 概念）。

  async installSkill(skillId: string, userId?: string, config?: any) {
    const spaceId = SpaceService.DEFAULT_WORK_SPACE_ID;
    const existing = await this.prisma.skillInstallation.findFirst({
      where: { skillId, userId: userId || null, spaceId },
    });
    if (existing) {
      // Re-enable if disabled
      return this.prisma.skillInstallation.update({
        where: { id: existing.id },
        data: { status: 'active', config: config || existing.config },
      });
    }
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      select: { version: true },
    });
    return this.prisma.skillInstallation.create({
      data: {
        skillId,
        userId: userId || null,
        config: config || {},
        version: skill?.version ?? null,
        status: 'active',
        spaceId,
      },
    });
  }

  async uninstallSkill(skillId: string, userId?: string) {
    return this.prisma.skillInstallation.deleteMany({
      where: {
        skillId,
        userId: userId || null,
        spaceId: SpaceService.DEFAULT_WORK_SPACE_ID,
      },
    });
  }

  /**
   * 技能版本列表（升级/回滚审计依据）。
   */
  async getSkillVersions(skillId: string) {
    return this.prisma.skillVersion.findMany({
      where: { skillId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        version: true,
        changelog: true,
        userId: true,
        createdAt: true,
      },
    });
  }

  /**
   * 升级技能：快照当前内容为新版本并更新安装版本。
   * input.content/version 传入时同时更新技能本体（否则仅记录快照）。
   */
  async upgradeSkill(
    skillId: string,
    userId: string,
    input: { content?: string; version?: string; changelog?: string } = {},
  ) {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      select: { id: true, name: true, version: true, content: true },
    });
    if (!skill) throw new NotFoundException(`Skill ${skillId} not found`);

    const nextVersion = input.version ?? skill.version ?? '1.0.0';
    const nextContent = input.content ?? skill.content;

    await this.prisma.$transaction(async (tx) => {
      // 1) 快照旧内容为新版本（升级前状态）
      await tx.skillVersion.create({
        data: {
          skillId,
          userId,
          name: skill.name,
          version: skill.version ?? null,
          changelog: input.changelog ?? null,
          content: skill.content ?? null,
        },
      });
      // 2) 更新技能本体
      await tx.skill.update({
        where: { id: skillId },
        data: { version: nextVersion, content: nextContent },
      });
      // 3) 更新安装版本快照
      await tx.skillInstallation.updateMany({
        where: { skillId, spaceId: SpaceService.DEFAULT_WORK_SPACE_ID },
        data: { version: nextVersion },
      });
    });

    await this.audit.record({
      actorUserId: userId,
      action: 'skill.upgrade',
      spaceId: SpaceService.DEFAULT_WORK_SPACE_ID,
      toolName: skillId,
      inputJson: { from: skill.version, to: nextVersion, changelog: input.changelog },
      authorization: 'auto',
    });

    return this.getSkillVersions(skillId);
  }

  /**
   * 回滚技能到指定历史版本：恢复 content/version，并记录一条回滚快照。
   */
  async rollbackSkill(skillId: string, versionId: string, userId: string) {
    const target = await this.prisma.skillVersion.findUnique({
      where: { id: versionId },
    });
    if (!target || target.skillId !== skillId) {
      throw new NotFoundException(`SkillVersion ${versionId} not found`);
    }
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      select: { version: true, content: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // 回滚前先快照当前状态（可再回滚回升级态）
      await tx.skillVersion.create({
        data: {
          skillId,
          userId,
          name: target.name,
          version: skill?.version ?? null,
          changelog: `rollback to ${target.version ?? versionId}`,
          content: skill?.content ?? null,
        },
      });
      await tx.skill.update({
        where: { id: skillId },
        data: { version: target.version ?? null, content: target.content ?? null },
      });
      await tx.skillInstallation.updateMany({
        where: { skillId, spaceId: SpaceService.DEFAULT_WORK_SPACE_ID },
        data: { version: target.version ?? null },
      });
    });

    await this.audit.record({
      actorUserId: userId,
      action: 'skill.rollback',
      spaceId: SpaceService.DEFAULT_WORK_SPACE_ID,
      toolName: skillId,
      inputJson: { targetVersionId: versionId, targetVersion: target.version },
      authorization: 'auto',
    });

    return this.getSkillVersions(skillId);
  }

  async getInstallationStatus(skillId: string, userId?: string) {
    const installation = await this.prisma.skillInstallation.findFirst({
      where: {
        skillId,
        userId: userId || null,
        spaceId: SpaceService.DEFAULT_WORK_SPACE_ID,
      },
    });
    return {
      installed: !!installation,
      status: installation?.status || null,
      config: installation?.config || null,
    };
  }

  async getUserInstallations(userId: string) {
    return this.prisma.skillInstallation.findMany({
      where: { userId, spaceId: SpaceService.DEFAULT_WORK_SPACE_ID },
      include: { skill: true },
    });
  }
}
