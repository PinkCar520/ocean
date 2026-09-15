import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';
import { WorkerService } from './worker.service';

/**
 * Gateway Worker 独立进程入口。
 *
 * 启动：pnpm --filter gateway worker:dev（开发） / worker:start（生产）
 * 与 HTTP 服务（src/main.ts）分离部署，通过 Outbox 租约消费 run.requested。
 * 优雅退出：SIGTERM/SIGINT 停止取件并关闭 Prisma 连接池；
 * 未完成 job 的租约过期后由其他 Worker 或下次启动恢复。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: process.env.WORKER_LOG_LEVEL
      ? [process.env.WORKER_LOG_LEVEL as 'log' | 'debug' | 'warn' | 'error']
      : ['log', 'warn', 'error'],
  });

  const worker = app.get(WorkerService);
  await worker.onModuleInit(); // 恢复僵尸 Run 后开始取件

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    worker.onModuleDestroy();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();
