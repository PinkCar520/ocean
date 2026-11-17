import {
  Inject,
  Injectable,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Checkpoints } from '@ocean/core/checkpoints';
import type { Tool, ToolContext } from './tool.types';

@Injectable()
export class GatewayCheckpointService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly db: PrismaClient,
    @Optional()
    @Inject('GATEWAY_CHECKPOINT_ROOTS')
    private readonly roots: Record<string, string> = JSON.parse(
      process.env.OCEAN_GATEWAY_WORKSPACES ?? '{}',
    ),
  ) {}
  private async store(context?: ToolContext) {
    if (!context?.runId || !context.toolCallId)
      throw new ForbiddenException('Checkpoint Run context required');
    const run = await this.db.agentRun.findUnique({
      where: { id: context.runId },
    });
    if (
      !run ||
      run.userId !== context.userId ||
      !Object.hasOwn(this.roots, run.spaceId)
    )
      throw new ForbiddenException(
        'Checkpoint workspace not configured for this Run',
      );
    const sessionId =
      typeof (run.metadata as any)?.sessionId === 'string'
        ? (run.metadata as any).sessionId
        : run.id;
    return new Checkpoints({
      cwd: this.roots[run.spaceId],
      userId: run.userId,
      sessionId,
      runId: run.id,
      toolCallId: context.toolCallId,
    });
  }
  tools(): Tool[] {
    return [
      {
        name: 'checkpoint.write',
        description:
          'Apply approved filesystem changes with a durable rollback checkpoint.',
        requiresApproval: true,
        effect: 'idempotent-write',
        inputSchema: z.object({
          changes: z
            .array(
              z.object({
                path: z.string().min(1),
                content: z.string().nullable(),
                expectedBefore: z.string().optional(),
              }),
            )
            .min(1)
            .max(20),
        }),
        execute: async (input, context) => ({
          checkpointId: await (
            await this.store(context)
          ).change(input.changes as any),
        }),
      },
      {
        name: 'checkpoint.rollback',
        description:
          'Rollback a prior checkpoint only if current contents still match its recorded result.',
        requiresApproval: true,
        effect: 'idempotent-write',
        inputSchema: z.object({ checkpointId: z.string().uuid() }),
        execute: async (input, context) => {
          await (
            await this.store(context)
          ).rollback(String(input.checkpointId));
          return { rolledBack: true };
        },
      },
    ];
  }
}
