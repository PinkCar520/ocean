import { Module } from '@nestjs/common';
import { join } from 'path';

import { ArtifactStore } from '../artifact/artifact.store';
import { EgressPolicy } from '../sandbox/egress-policy';
import { ToolRegistry, TOOL_REGISTRY } from './tool.registry';

/**
 * ToolModule —— 工具注册表（幂等工具调用基础设施，Phase 4 第 4 项）。
 * ToolRegistry 同时以 class 与 TOOL_REGISTRY token 提供，供 ToolExecutor
 * 与未来 PlanLoop/MCP 适配器按名查找工具。
 * - EgressPolicy 由环境变量 `SANDBOX_EGRESS_ALLOWLIST` 构建（Phase 4 第 7 项）。
 * - ArtifactStore 注入工具工厂，供 artifact.save/load（Phase 4 第 8 项）。
 */
@Module({
  providers: [
    { provide: EgressPolicy, useFactory: () => EgressPolicy.fromEnv() },
    {
      provide: ArtifactStore,
      useFactory: (prisma: any) =>
        new ArtifactStore(
          prisma,
          process.env.ARTIFACT_ROOT ?? join(process.cwd(), 'artifacts'),
        ),
      inject: ['PRISMA_CLIENT'],
    },
    ToolRegistry,
    { provide: TOOL_REGISTRY, useExisting: ToolRegistry },
  ],
  exports: [ToolRegistry, TOOL_REGISTRY, ArtifactStore],
})
export class ToolModule {}
