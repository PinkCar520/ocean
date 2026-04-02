import { Module } from '@nestjs/common';
import { SkillOrchestrator } from './skill.orchestrator';
import { SkillLoader } from './skill.loader';
import { MCPModule } from '../mcp/mcp.module';
import { RpcModule } from '../chat/rpc.module';

/**
 * SkillModule
 *
 * Wires up the AgentSkills-compatible skill system:
 *   - SkillLoader: Discovery, Parse, Disclose (catalog), Activate (full content)
 *   - SkillOrchestrator: System Prompt builder + activate_skill tool + stream/text API
 *
 * SkillRegistry and AiguideLoader are removed — their logic is now in SkillLoader.
 * Depends on RpcModule (not ChatModule) to avoid circular dependency.
 */
@Module({
  imports: [MCPModule, RpcModule],
  providers: [SkillOrchestrator, SkillLoader],
  exports: [SkillOrchestrator, SkillLoader],
})
export class SkillModule {}
