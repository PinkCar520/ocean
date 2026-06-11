import { Module, Global } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Global()
@Module({
  providers: [
    {
      provide: 'PRISMA_CLIENT',
      useFactory: () => {
        // Prisma 7 推荐的“适配器注入模式”
        const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ocean?schema=public';
        
        // 1. 创建原生 pg 连接池
        const pool = new Pool({ connectionString });
        
        // 2. 将其包装为 Prisma 适配器
        const adapter = new PrismaPg(pool);
        
        // 3. 注入到 PrismaClient
        return new PrismaClient({ adapter });
      },
    },
  ],
  exports: ['PRISMA_CLIENT'],
})
export class PrismaModule {}
