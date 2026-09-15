import { Controller, Get, Post, Delete, Body, Param, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SpaceService } from '../space/space.service';

/**
 * 知识项目 CRUD（Phase 5：强制 Space 范围）。
 * 客户端当前无 Space 概念，默认解析到 Work Space；
 * 查询与写入均限定 spaceId，避免跨 Space 读到其他数据。
 */
@Controller('api/knowledge-projects')
export class KnowledgeProjectController {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly spaceService: SpaceService,
  ) {}

  @Get()
  async findAll() {
    const spaceId = SpaceService.DEFAULT_WORK_SPACE_ID;
    const projects = await this.prisma.knowledgeProject.findMany({
      where: { spaceId },
      include: {
        _count: {
          select: { documents: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: projects };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const project = await this.prisma.knowledgeProject.findFirst({
      where: { id, spaceId: SpaceService.DEFAULT_WORK_SPACE_ID },
      include: {
        _count: {
          select: { documents: true }
        }
      }
    });
    if (!project) {
      return { success: false, error: 'Project not found' };
    }
    return { success: true, data: project };
  }

  @Post()
  async create(@Body() data: { name: string; category: string; description?: string; iconUrl?: string; color?: string }) {
    const project = await this.prisma.knowledgeProject.create({
      data: {
        ...data,
        spaceId: SpaceService.DEFAULT_WORK_SPACE_ID,
      }
    });
    return { success: true, data: project };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.knowledgeProject.deleteMany({
      where: { id, spaceId: SpaceService.DEFAULT_WORK_SPACE_ID }
    });
    return { success: true };
  }
}
