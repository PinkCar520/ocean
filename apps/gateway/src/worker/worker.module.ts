import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RunModule } from '../run/run.module';
import { ToolModule } from '../tool/tool.module';
import { RunRunner } from './run-runner';
import { ToolExecutor } from './tool-executor';
import { WorkerService } from './worker.service';

/**
 * WorkerModule —— 独立 Worker 进程的根模块。
 *
 * 只加载 Worker 运行所需的最小依赖（Prisma + Run/Outbox + Ai 模型网关 + 工具注册表），
 * 不引入 AppModule 的 HTTP 控制器与全局认证守卫。
 * ConfigModule 读取仓库根 .env（pnpm --filter 运行时 cwd 为 apps/gateway）。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    RunModule,
    AiModule,
    ToolModule,
  ],
  providers: [WorkerService, RunRunner, ToolExecutor],
})
export class WorkerModule {}
