import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * AppModule
 *
 * 核心中枢，现在集成了 Prisma 数据库引擎和 Auth 用户中心。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, // ← 导入全局数据库模块
    AuthModule,   // 内部包含 UserService
    ChatModule,   
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
