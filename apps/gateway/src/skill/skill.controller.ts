import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { SkillLoader } from './skill.loader';

@Controller('api/skills')
export class SkillController {
  constructor(private readonly skillLoader: SkillLoader) {}

  @Get('catalog')
  async getCatalog() {
    const catalog = await this.skillLoader.getAllSkills();

    // Map internal paths to a safe public payload
    return catalog.map((c) => ({
      id: c.name,
      name: c.name,
      description: c.description,
      locales: c.locales || null,
    }));
  }

  @Get('content/:id')
  async getSkill(@Param('id') id: string) {
    const name = id.replace(/\.md$/, '');
    const content = await this.skillLoader.activate(name);
    if (!content) {
      throw new NotFoundException(`Skill ${name} not found`);
    }
    return { content };
  }
}
