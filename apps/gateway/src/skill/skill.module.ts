import { Module } from '@nestjs/common';
import { SkillOrchestrator } from './skill.orchestrator';
import { SkillLoader } from './skill.loader';
import { PermissionService } from './permission.service';
import { MCPModule } from '../mcp/mcp.module';
import { RpcModule } from '../chat/rpc.module';
import { SessionModule } from '../session/session.module';
import { SkillController } from './skill.controller';
import { ApprovalModule } from './approval.module';
import { ApprovalService } from './approval.service';
import { PermissionModule } from './permission.module';
import { PermissionController } from './permission.controller';
/**
 * SkillModule
 *
 * Wires up the AgentSkills-compatible skill system:
 *   - SkillLoader: Discovery, Parse, Disclose (catalog), Activate (full content)
 *   - SkillOrchestrator: System Prompt builder + activate_skill tool + stream/text API
 *   - SkillController: Serves catalog API to frontend
 *   - PermissionService: Claude Code-compatible permission rules evaluation
 *   - PermissionController: REST API for permission inspection
 *
 * SkillRegistry and AiguideLoader are removed — their logic is now in SkillLoader.
 * Depends on RpcModule (not ChatModule) to avoid circular dependency.
 * Depends on SessionModule for Server-First message persistence.
 */
import { TracingModule } from '../tracing/tracing.module';
import { RAGModule } from '../rag/rag.module';
import { ZentaoModule } from '../zentao/zentao.module';
import { InteractiveManager } from './interactive.manager';
import { ModelRegistry } from '../runtime/model.registry';
import { PromptComposer } from '../runtime/prompt.composer';
import { ContextAssembler } from '../runtime/context.assembler';
import { ToolRuntime } from '../runtime/tool.runtime';
import { PolicyEvaluator } from '../runtime/policy.evaluator';
import { SkillResolver } from '../runtime/skill.resolver';

@Module({
  imports: [
    MCPModule, 
    RpcModule, 
    SessionModule, 
    ApprovalModule, 
    PermissionModule, 
    TracingModule, 
    RAGModule, 
    ZentaoModule
  ],
  controllers: [SkillController, PermissionController],
  providers: [
    SkillLoader,
    SkillOrchestrator,
    ApprovalService,
    PermissionService,
    InteractiveManager,
    // Agent Runtime 拆分（第 2 项）：六个独立职责模块，Orchestrator 委托
    ModelRegistry,
    PromptComposer,
    ContextAssembler,
    ToolRuntime,
    PolicyEvaluator,
    SkillResolver,
  ],
  exports: [
    SkillLoader, 
    SkillOrchestrator, 
    ApprovalService, 
    PermissionService,
    ModelRegistry,
    PromptComposer,
    ContextAssembler,
    ToolRuntime,
    PolicyEvaluator,
    SkillResolver,
  ],
})
export class SkillModule {}
