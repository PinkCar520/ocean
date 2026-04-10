import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillImportService } from './skill-import.service';

@Module({
  controllers: [SkillController],
  providers: [SkillService, SkillImportService],
  exports: [SkillService],
})
export class SkillRegistryModule {}
