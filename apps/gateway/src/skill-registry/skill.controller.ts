import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { SkillService, CreateSkillDto, UpdateSkillDto } from './skill.service';

@Controller('api/skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  /**
   * GET /api/skills
   * 获取技能列表，支持筛选
   */
  @Get()
  async getSkills(
    @Query('category') category?: string,
    @Query('source') source?: string,
    @Query('q') q?: string,
    @Query('featured') featured?: string,
  ) {
    const skills = await this.skillService.getSkills({
      category,
      source,
      q,
      isFeatured: featured === 'true',
    });
    return { success: true, data: skills };
  }

  /**
   * GET /api/skills/stats
   * 获取技能统计信息
   */
  @Get('stats')
  async getStats() {
    const stats = await this.skillService.getStats();
    return { success: true, data: stats };
  }

  /**
   * GET /api/skills/:id
   * 获取技能详情
   */
  @Get(':id')
  async getSkill(@Param('id') id: string) {
    const skill = await this.skillService.getSkillById(id);
    return { success: true, data: skill };
  }

  /**
   * POST /api/skills
   * 创建技能（内部使用）
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSkill(@Body() body: CreateSkillDto) {
    const skill = await this.skillService.createSkill(body);
    return { success: true, data: skill };
  }

  /**
   * PUT /api/skills/:id
   * 更新技能
   */
  @Put(':id')
  async updateSkill(@Param('id') id: string, @Body() body: UpdateSkillDto) {
    const skill = await this.skillService.updateSkill(id, body);
    return { success: true, data: skill };
  }

  /**
   * DELETE /api/skills/:id
   * 删除技能
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteSkill(@Param('id') id: string) {
    await this.skillService.deleteSkill(id);
    return { success: true };
  }
}
