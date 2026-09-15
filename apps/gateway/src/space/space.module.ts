import { Global, Module } from '@nestjs/common';
import { SpaceService } from './space.service';

/**
 * SpaceModule —— Phase 5 Space 数据边界。
 * 全局提供 SpaceService（Space 校验 / Membership 访问控制），
 * 供 Session / Chat / Run / Knowledge 等模块注入使用。
 */
@Global()
@Module({
  providers: [SpaceService],
  exports: [SpaceService],
})
export class SpaceModule {}
