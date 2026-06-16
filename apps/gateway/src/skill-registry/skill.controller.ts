import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, HttpCode, HttpStatus, SetMetadata } from '@nestjs/common';
import { SkillService, CreateSkillDto, UpdateSkillDto } from './skill.service';
import { SkillImportService, ImportSkillDto } from './skill-import.service';
import { IS_PUBLIC_KEY } from '../auth/sso.guard';
import { SkillOrchestrator } from '../skill/skill.orchestrator';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('api/skills')
export class SkillController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillImportService: SkillImportService,
    private readonly skillOrchestrator: SkillOrchestrator,
  ) {}

  /**
   * GET /api/skills
   * 获取技能列表，支持筛选
   */
  @Public()
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
  @Public()
  @Get('stats')
  async getStats() {
    const stats = await this.skillService.getStats();
    return { success: true, data: stats };
  }

  /**
   * GET /api/skills/catalog
   * 获取技能目录（名称 + 本地化信息，用于工具名称翻译）
   */
  @Public()
  @Get('catalog')
  async getCatalog() {
    const skills = await this.skillService.getSkills({});
    const catalog = skills.map((s: any) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      locales: {
        zh: {
          displayName: s.name,
          description: s.description,
        },
        en: {
          displayName: s.name,
          description: s.description,
        },
      },
    }));
    return catalog;
  }

  /**
   * GET /api/skills/:id
   * 获取技能详情
   */
  @Public()
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
  async createSkill(@Body() body: CreateSkillDto, @Req() req: any) {
    const userId = req.user?.dbId;
    if (!body.slug && body.name) {
      body.slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Math.random().toString(36).substring(2, 8);
    } else if (!body.slug) {
      body.slug = 'skill-' + Math.random().toString(36).substring(2, 8);
    }
    const skill = await this.skillService.createSkill(body, userId);
    return { success: true, data: skill };
  }

  /**
   * PUT /api/skills/:id
   * 更新技能
   */
  @Put(':id')
  async updateSkill(@Param('id') id: string, @Body() body: UpdateSkillDto, @Req() req: any) {
    const userId = req.user?.dbId;
    const skill = await this.skillService.updateSkill(id, body, userId);
    return { success: true, data: skill };
  }

  /**
   * DELETE /api/skills/:id
   * 删除技能
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteSkill(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.dbId;
    await this.skillService.deleteSkill(id, userId);
    return { success: true };
  }

  /**
   * GET /api/skills/:id/history
   * 获取技能版本历史
   */
  @Get(':id/history')
  async getSkillHistory(@Param('id') id: string) {
    const history = await this.skillService.getSkillHistory(id);
    return { success: true, data: history };
  }

  /**
   * POST /api/skills/:id/install
   * 安装技能
   */
  @Post(':id/install')
  @HttpCode(HttpStatus.CREATED)
  async installSkill(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const userId = req.user?.dbId;
    const config = body?.config || {};
    const installation = await this.skillService.installSkill(id, userId, config);
    return { success: true, data: installation };
  }

  /**
   * DELETE /api/skills/:id/install
   * 卸载技能
   */
  @Delete(':id/install')
  @HttpCode(HttpStatus.OK)
  async uninstallSkill(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.dbId;
    await this.skillService.uninstallSkill(id, userId);
    return { success: true };
  }

  /**
   * GET /api/skills/:id/install/status
   * 获取安装状态
   */
  @Public()
  @Get(':id/install/status')
  async getInstallStatus(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.dbId;
    const status = await this.skillService.getInstallationStatus(id, userId);
    return { success: true, data: status };
  }

  /**
   * POST /api/skills/import
   * 从外部源导入技能
   */
  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  async importSkill(@Body() body: ImportSkillDto) {
    try {
      const skill = await this.skillImportService.importSkill(body);
      return {
        success: true,
        data: {
          message: `Successfully imported skill "${skill.name}" from ${body.source}`,
          skill,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * POST /api/skills/sandbox/test
   * 运行沙盒测试调用
   */
  @Post('sandbox/test')
  async testSandbox(@Body() body: any) {
    const { message, activeSkill, variables } = body;
    const result = await this.skillOrchestrator.runSandboxTest(message, activeSkill, variables);
    return { success: true, data: result };
  }
  /**
   * POST /api/skills/generate
   * 从自然语言描述生成技能
   */
  @Post('generate')
  async generateSkill(@Body() body: any) {
    const { instruction } = body;
    if (!instruction) {
      throw new Error('Instruction is required');
    }
    const result = await this.skillOrchestrator.generateSkill(instruction);
    return { success: true, data: result };
  }
}
