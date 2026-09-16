import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RpcModule } from './rpc.module';
import { SkillModule } from '../skill/skill.module';
import { SessionModule } from '../session/session.module';
import { RunModule } from '../run/run.module';
import { AuthModule } from '../auth/auth.module';
import { SpaceModule } from '../space/space.module';

/**
 * ChatModule
 *
 * 负责与本地 CLI 通信的基础设施及旧版模型列表接口。
 * 核心 AI 编排逻辑已迁移到 SkillModule；Run 驱动聊天依赖 RunModule（第 3 项）。
 */
@Module({
  imports: [
    ConfigModule,
    RpcModule,
    SkillModule,
    SessionModule,
    RunModule,
    AuthModule,
    SpaceModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
