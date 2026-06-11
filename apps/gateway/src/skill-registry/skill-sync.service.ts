import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SkillLoader } from '../skill/skill.loader';
import { SkillService } from './skill.service';

@Injectable()
export class SkillSyncService implements OnModuleInit {
  private readonly logger = new Logger(SkillSyncService.name);

  constructor(
    private readonly skillLoader: SkillLoader,
    private readonly skillService: SkillService,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting auto-sync of local skills to registry...');
    try {
      const localSkills = await this.skillLoader.getAllSkills();
      let createdCount = 0;
      let updatedCount = 0;

      for (const skill of localSkills) {
        const slug = skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        const existing = await this.skillService.getSkillBySlug(slug);

        const manifestData = {
          allowedTools: skill.allowedTools,
          requiresApproval: skill.requiresApproval,
          compatibility: skill.compatibility,
        };

        const category = this.inferCategory(skill.name, skill.compatibility || '');
        const icon = this.inferIcon(skill.name);
        const tags = this.inferTags(skill.compatibility || '');

        if (!existing) {
          await this.skillService.createSkill({
            slug,
            name: skill.name,
            description: skill.description,
            category,
            source: 'internal',
            isFeatured: false,
            isPublic: true,
            icon,
            tags,
            manifest: manifestData,
            compatibility: skill.compatibility,
          });
          createdCount++;
          this.logger.log(`  ✓ Auto-synced new skill: ${skill.name}`);
        } else {
          await this.skillService.updateSkill(existing.id, {
            name: skill.name,
            description: skill.description,
            category,
            icon,
            tags,
          });
          updatedCount++;
          this.logger.log(`  ↻ Updated existing skill: ${skill.name}`);
        }
      }
      this.logger.log(`Skill auto-sync completed: ${createdCount} created, ${updatedCount} updated.`);
    } catch (e: any) {
      this.logger.error(`Failed to auto-sync skills: ${e.message}`, e.stack);
    }
  }

  private inferCategory(name: string, comp: string): string {
    const combined = `${name} ${comp}`.toLowerCase();
    if (combined.includes('zentao') || combined.includes('bug') || combined.includes('prd')) return 'pm';
    if (combined.includes('jenkins') || combined.includes('ci') || combined.includes('docker')) return 'cicd';
    if (combined.includes('git') || combined.includes('merge') || combined.includes('pr')) return 'vc';
    if (combined.includes('slack') || combined.includes('mail') || combined.includes('chat')) return 'communication';
    return 'other';
  }

  private inferIcon(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('bug') || lower.includes('fix')) return 'CheckCircle2';
    if (lower.includes('jenkins') || lower.includes('build')) return 'Rocket';
    if (lower.includes('git') || lower.includes('pr')) return 'GitPullRequest';
    if (lower.includes('chat') || lower.includes('message')) return 'MessageSquare';
    if (lower.includes('docker')) return 'Box';
    if (lower.includes('mail') || lower.includes('email')) return 'Mail';
    return 'Star';
  }

  private inferTags(comp: string): string[] {
    const tags: string[] = [];
    const comps = comp.toLowerCase();
    if (comps.includes('zentao')) tags.push('zentao');
    if (comps.includes('gitlab')) tags.push('gitlab');
    if (comps.includes('jenkins')) tags.push('jenkins');
    if (comps.includes('docker')) tags.push('docker');
    return [...new Set(tags)];
  }
}
