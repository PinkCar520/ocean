import { Module } from '@nestjs/common';
import { CodeService } from './code.service';
import { CodeController } from './code.controller';

/** CodeModule —— Phase 6 6c：Code 投影（仓库 / Diff / Review）。 */
@Module({
  controllers: [CodeController],
  providers: [CodeService],
  exports: [CodeService],
})
export class CodeModule {}
