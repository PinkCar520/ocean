import { Module } from '@nestjs/common';
import { LifeService } from './life.service';
import { LifeController } from './life.controller';

/** LifeModule —— Phase 6 6e：Life 投影（个人记忆 / 隐私）。 */
@Module({
  controllers: [LifeController],
  providers: [LifeService],
  exports: [LifeService],
})
export class LifeModule {}
