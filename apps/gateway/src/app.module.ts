import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MetricsService } from './obs/metrics.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { PrismaModule } from './prisma/prisma.module';
import { SpaceModule } from './space/space.module';
import { CodeModule } from './code/code.module';
import { WorkModule } from './work/work.module';
import { LifeModule } from './life/life.module';
import { UserModule } from './user/user.module';
import { UploadModule } from './upload/upload.module';
import { SessionModule } from './session/session.module';
import { SkillRegistryModule } from './skill-registry/skill-registry.module';
import { MCPServerModule } from './mcp-server/mcp-server.module';
import { ApprovalModule } from './skill/approval.module';
import { ProxyModule } from './proxy/proxy.module';
import { SsoAuthGuard } from './auth/sso.guard';
import { TracingModule } from './tracing/tracing.module';
import { RAGModule } from './rag/rag.module';
import { ZentaoModule } from './zentao/zentao.module';
import { SkillModule } from './skill/skill.module';
import { RunModule } from './run/run.module';

/**
 * AppModule
 *
 * 核心中枢，现在集成了 Prisma 数据库引擎、Auth 用户中心以及用户管理模块。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, // ← 全局数据库模块
    SpaceModule,  // ← 全局 Space 数据边界（Phase 5）
    TracingModule, // ← 全局链路追踪模块
    RAGModule,     // ← 全局知识库/向量检索模块
    ZentaoModule,  // ← 禅道集成模块
    AuthModule,   // 内部包含 UserService
    ChatModule,
    UserModule,   // 对外暴露用户中心接口
    UploadModule, // 文件上传模块
    SessionModule, // 会话漫游数据接口模块
    SkillRegistryModule, // 技能注册中心
    SkillModule,  // ← Agent Skills 编排核心
    MCPServerModule, // MCP Server 管理
    ApprovalModule, // AGP 审批治理
    RunModule, // Ocean v2 持久化执行 API
    CodeModule, // Phase 6 6c：Code 投影（仓库/Diff/Review）
    WorkModule, // Phase 6 6d：Work 投影（项目/任务）
    LifeModule, // Phase 6 6e：Life 投影（个人记忆/隐私）
    ProxyModule, // 图片代理
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SsoAuthGuard, // 全局认证守卫
    },
    MetricsService, // Phase 7：运行指标
  ],
})
export class AppModule {}
