import { Controller, Get, Post, Delete, Body, Param, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Controller('api/knowledge-projects')
export class KnowledgeProjectController {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {}

  @Get()
  async findAll() {
    const projects = await this.prisma.knowledgeProject.findMany({
      include: {
        _count: {
          select: { documents: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: projects };
  }

  @Post()
  async create(@Body() data: { name: string; category: string; description?: string; iconUrl?: string; color?: string }) {
    const project = await this.prisma.knowledgeProject.create({
      data: {
        ...data,
      }
    });
    return { success: true, data: project };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.knowledgeProject.delete({
      where: { id }
    });
    return { success: true };
  }
}
