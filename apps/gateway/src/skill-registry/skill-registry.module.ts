import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillImportService } from './skill-import.service';
import { SkillModule } from '../skill/skill.module';
import { SkillSyncService } from './skill-sync.service';

@Module({
  imports: [SkillModule],
  controllers: [SkillController],
  providers: [SkillService, SkillImportService, SkillSyncService],
  exports: [SkillService],
})
export class SkillRegistryModule {}
