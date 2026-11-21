import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createScheduleSchema, RunScheduleService } from '../run/run-schedule.service';
import { SubagentRunsService } from '../run/subagent-runs.service';
import { MCPClientPool } from '../mcp/mcp-client.pool';
import { createMcpResourceTools } from '../tool/mcp-resource.tools';
import { ToolRegistry } from '../tool/tool.registry';
import { TerminalToolError, type ToolContext } from '../tool/tool.types';

function requireContext(ctx?: ToolContext): ToolContext & { spaceId: string; toolCallId: string } {
  if (!ctx?.spaceId || !ctx.toolCallId) throw new TerminalToolError('Tool requires an authenticated Run context.');
  return { ...ctx, spaceId: ctx.spaceId, toolCallId: ctx.toolCallId };
}

@Injectable()
export class WorkerAgentTools implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly schedules: RunScheduleService,
    private readonly subagents: SubagentRunsService,
    private readonly mcp: MCPClientPool,
  ) {}

  onModuleInit() {
    for (const tool of createMcpResourceTools(this.mcp)) this.registry.register(tool);
    const scheduleInput = createScheduleSchema.omit({ spaceId: true });
    const cancelInput = z.object({ scheduleId: z.string().min(1).max(200) }).strict();
    const messageInput = z.object({ recipientId: z.string().min(1).max(200), message: z.string().trim().min(1).max(16_000) }).strict();

    this.registry.register({
      name: 'cron_create',
      description: 'Schedule an Ocean background task in the current Space with five-field UTC cron. Use only for tasks the user wants scheduled.',
      inputSchema: scheduleInput,
      effect: 'idempotent-write',
      execute: async (input, context) => {
        const ctx = requireContext(context);
        const id = createHash('sha256').update(JSON.stringify([ctx.runId, ctx.toolCallId])).digest('hex');
        return this.schedules.create(ctx.userId, { ...scheduleInput.parse(input), spaceId: ctx.spaceId }, id);
      },
    });
    this.registry.register({
      name: 'cron_list',
      description: 'List the current user’s scheduled tasks in this Space.',
      inputSchema: z.object({}).strict(),
      effect: 'read',
      execute: async (_, context) => {
        const ctx = requireContext(context);
        return this.schedules.list(ctx.userId, ctx.spaceId);
      },
    });
    this.registry.register({
      name: 'cron_delete',
      description: 'Cancel a scheduled task in the current Space without cancelling previous runs.',
      inputSchema: cancelInput,
      effect: 'idempotent-write',
      execute: async (input, context) => {
        const ctx = requireContext(context);
        return this.schedules.disable(ctx.userId, cancelInput.parse(input).scheduleId, ctx.spaceId);
      },
    });
    this.registry.register({
      name: 'list_team_members',
      description: 'List the parent and teammates in the current Run team.',
      inputSchema: z.object({}).strict(),
      effect: 'read',
      execute: async (_, context) => {
        const ctx = requireContext(context);
        return this.subagents.team(ctx.runId, ctx.userId);
      },
    });
    this.registry.register({
      name: 'send_team_message',
      description: 'Deliver a message to another Ocean Run in the current team.',
      inputSchema: messageInput,
      effect: 'idempotent-write',
      execute: async (input, context) => {
        const ctx = requireContext(context);
        return this.subagents.sendTeamMessage(ctx.runId, ctx.userId, {
          ...messageInput.parse(input), messageId: ctx.toolCallId,
        });
      },
    });
  }
}
