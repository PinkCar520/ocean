import { childPolicy } from './subagent-policy';
import { runEventSchema } from '@ocean/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OutboxService } from './outbox.service';
type SubagentRequest = { toolCallId: string; agent: string; prompt: string };
const terminal = ['succeeded', 'failed', 'cancelled'];
@Injectable()
export class SubagentRunsService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly db: PrismaClient,
    private readonly outbox: OutboxService,
  ) {}
  async create(
    parentId: string,
    userId: string,
    input: SubagentRequest,
  ) {
    return this.db.$transaction(tx => this.createInTransaction(tx, parentId, userId, input));
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    parentId: string,
    userId: string,
    input: SubagentRequest,
    modelDelegation = false,
  ) {
    if (
      !input ||
      ![input.toolCallId, input.agent, input.prompt].every(
        (value) => typeof value === 'string' && value.length > 0,
      ) ||
      input.toolCallId.length > 200 ||
      input.agent.length > 128 ||
      input.prompt.length > 100000
    )
      throw new BadRequestException('Invalid subagent input');
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM agent_runs WHERE id = ${parentId} AND "userId" = ${userId} FOR UPDATE`,
    );
    const parent = await tx.agentRun.findUnique({ where: { id: parentId } });
    if (!parent || parent.userId !== userId)
      throw new NotFoundException('Parent Run not found');
    const existing = await tx.agentRun.findUnique({
      where: {
        parentRunId_parentToolCallId: {
          parentRunId: parentId,
          parentToolCallId: input.toolCallId,
        },
      },
    });
    if (existing) {
      if (
        existing.input !== input.prompt ||
        (existing.metadata as any)?.agent !== input.agent
      )
        throw new BadRequestException(
          'Subagent call identity reused with different input',
        );
      return existing;
    }
    if (terminal.includes(parent.status) || (!modelDelegation && parent.executionToken))
      throw new BadRequestException(
        'Parent Run must be idle before delegation',
      );
    if ((await tx.agentRun.count({ where: { parentRunId: parentId } })) >= 8)
      throw new BadRequestException('Subagent child limit reached');
    let ancestor = parent;
    let depth = 0;
    while (ancestor.parentRunId) {
      if (++depth >= 3)
        throw new BadRequestException('Subagent depth limit reached');
      const next = await tx.agentRun.findUnique({
        where: { id: ancestor.parentRunId },
      });
      if (!next) throw new BadRequestException('Invalid subagent lineage');
      ancestor = next;
    }
    const child = await tx.agentRun.create({
      data: {
        userId,
        spaceId: parent.spaceId,
        spaceType: parent.spaceType,
        input: input.prompt,
        priority: parent.priority,
        parentRunId: parentId,
        parentToolCallId: input.toolCallId,
        metadata: {
          agent: input.agent,
          subagentPolicy: childPolicy(input.agent, parent.parentRunId, parent.metadata) as any,
          ...((parent.metadata as Prisma.JsonObject | null)?.nonInteractive === true && { nonInteractive: true }),
        },
      },
    });
    const latest = await tx.runStep.findFirst({
      where: { runId: parentId },
      orderBy: { seq: 'desc' },
    });
    const parentStep = await tx.runStep.create({
      data: {
        runId: parentId,
        seq: (latest?.seq ?? 0) + 1,
        kind: 'subagent',
        status: 'started',
        idempotencyKey: `subagent:${input.toolCallId}`,
        input: input as any,
        checkpoint: { childRunId: child.id, ...(modelDelegation && { modelDelegation: true }) },
      },
    });
    await this.stepEvent(tx, parentStep, 'run.step_started');
    await tx.agentRun.update({
      where: { id: parentId },
      data: {
        status: 'waiting_for_input',
        metadata: {
          ...((parent.metadata as any) ?? {}),
          subagentsPending: true,
        },
      },
    });
    await tx.outboxEvent.updateMany({
      where: {
        aggregateId: parentId,
        topic: 'run.requested',
        status: 'pending',
      },
      data: {
        status: 'processed',
        lockedAt: null,
        lockedBy: null,
        processedAt: new Date(),
      },
    });
    await this.event(tx, parentId, 'waiting_for_input');
    const event = {
      id: randomUUID(),
      runId: child.id,
      sequence: 0,
      occurredAt: child.createdAt.toISOString(),
      type: 'run.created',
      status: 'queued',
    };
    await tx.runEvent.create({
      data: {
        id: event.id,
        runId: child.id,
        sequence: 0,
        type: event.type,
        payload: event,
      },
    });
    await this.outbox.enqueueRunRequested(tx, {
      version: 1,
      runId: child.id,
      userId,
    });
    return child;
  }
  async team(runId: string, userId: string) {
    const member = await this.db.agentRun.findFirst({
      where: { id: runId, userId },
      select: { id: true, parentRunId: true, spaceId: true },
    });
    if (!member) throw new NotFoundException('Team Run not found.');
    const rootId = member.parentRunId ?? member.id;
    const members = await this.db.agentRun.findMany({
      where: { userId, spaceId: member.spaceId, OR: [{ id: rootId }, { parentRunId: rootId }] },
      select: { id: true, status: true, metadata: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      rootId,
      members: members.map(({ id, status, metadata }) => {
        const agent = (metadata as Prisma.JsonObject | null)?.agent;
        return { id, status, ...(typeof agent === 'string' && { agent }) };
      }),
    };
  }

  async sendTeamMessage(runId: string, userId: string, input: { recipientId: string; message: string; messageId?: string }) {
    if (!input || typeof input.recipientId !== 'string' || !input.recipientId
      || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 16_000
      || (input.messageId !== undefined && (typeof input.messageId !== 'string' || input.messageId.length > 200))) {
      throw new BadRequestException('Invalid team message.');
    }
    if (runId === input.recipientId) throw new BadRequestException('Choose another team member.');
    const team = await this.team(runId, userId);
    if (!team.members.some((member) => member.id === input.recipientId)) {
      throw new NotFoundException('Recipient is not in the Run team.');
    }
    const idempotencyKey = `team-message:${runId}:${input.messageId || randomUUID()}`;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM agent_runs WHERE id = ${input.recipientId} AND "userId" = ${userId} FOR UPDATE`);
      const recipient = await tx.agentRun.findFirst({ where: { id: input.recipientId, userId } });
      if (!recipient || (recipient.id !== team.rootId && recipient.parentRunId !== team.rootId)) {
        throw new NotFoundException('Recipient is not in the Run team.');
      }
      const existing = await tx.runStep.findUnique({
        where: { runId_idempotencyKey: { runId: recipient.id, idempotencyKey } },
      });
      if (existing) {
        if ((existing.input as Prisma.JsonObject | null)?.message !== input.message) {
          throw new BadRequestException('Team message ID was reused with different content.');
        }
        return { id: existing.id, recipientId: recipient.id };
      }
      if (terminal.includes(recipient.status)) throw new BadRequestException('Recipient Run has already ended.');
      const latest = await tx.runStep.findFirst({ where: { runId: recipient.id }, orderBy: { seq: 'desc' } });
      const step = await tx.runStep.create({
        data: {
          runId: recipient.id,
          seq: (latest?.seq ?? 0) + 1,
          kind: 'subagent',
          status: 'succeeded',
          idempotencyKey,
          input: { senderRunId: runId, message: input.message },
          checkpoint: { teamMessage: true },
          completedAt: new Date(),
        },
      });
      await this.stepEvent(tx, step, 'run.step_completed');
      return { id: step.id, recipientId: recipient.id };
    });
  }

  async reconcilePending() {
    const parents = await this.db.agentRun.findMany({
      where: { metadata: { path: ['subagentsPending'], equals: true } },
      select: { id: true },
      take: 100,
    });
    for (const parent of parents) await this.reconcile(parent.id);
  }
  async reconcile(parentId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM agent_runs WHERE id = ${parentId} FOR UPDATE`,
      );
      const parent = await tx.agentRun.findUnique({ where: { id: parentId } });
      if (!parent || !(parent.metadata as any)?.subagentsPending) return;
      if (terminal.includes(parent.status)) {
        await tx.agentRun.updateMany({
          where: { parentRunId: parentId, status: { notIn: terminal } },
          data: {
            status: 'cancelled',
            executionToken: null,
            executionJobId: null,
          },
        });
      }
      const children = await tx.agentRun.findMany({
        where: { parentRunId: parentId },
      });
      if (!children.length) return;
      let failedExternalDelegation = false;
      for (const child of children) {
        if (!terminal.includes(child.status)) continue;
        const step = await tx.runStep.findUnique({
          where: {
            runId_idempotencyKey: {
              runId: parentId,
              idempotencyKey: `subagent:${child.parentToolCallId}`,
            },
          },
        });
        const checkpoint = step?.checkpoint as Prisma.JsonObject | null | undefined;
        if (child.status !== 'succeeded' && checkpoint?.modelDelegation !== true) failedExternalDelegation = true;
        if (!step || step.status !== 'started') continue;
        const result = await tx.runStep.findFirst({
          where: { runId: child.id, kind: 'model_call', status: 'succeeded' },
          orderBy: { seq: 'desc' },
        });
        const updated = await tx.runStep.update({
          where: { id: step.id },
          data: {
            status: child.status === 'succeeded' ? 'succeeded' : 'failed',
            output: {
              childRunId: child.id,
              status: child.status,
              result: result?.output ?? null,
            },
            completedAt: new Date(),
          },
        });
        await this.stepEvent(tx, updated, 'run.step_completed');
      }
      if (children.some((child) => !terminal.includes(child.status))) return;
      const metadata = { ...(parent.metadata as any), subagentsPending: false };
      if (terminal.includes(parent.status)) {
        await tx.agentRun.update({
          where: { id: parentId },
          data: { metadata },
        });
        return;
      }
      const failed = failedExternalDelegation;
      await tx.agentRun.update({
        where: { id: parentId },
        data: { status: failed ? 'failed' : 'queued', metadata },
      });
      await this.event(tx, parentId, failed ? 'failed' : 'queued');
      if (!failed)
        await this.outbox.enqueueRunRequested(tx, {
          version: 1,
          runId: parentId,
          userId: parent.userId,
        });
    });
  }
  private async stepEvent(
    tx: Prisma.TransactionClient,
    step: any,
    type: 'run.step_started' | 'run.step_completed',
  ) {
    const latest = await tx.runEvent.findFirst({
      where: { runId: step.runId },
      orderBy: { sequence: 'desc' },
    });
    const event = runEventSchema.parse({
      id: randomUUID(),
      runId: step.runId,
      sequence: (latest?.sequence ?? -1) + 1,
      occurredAt: new Date().toISOString(),
      type,
      step: {
        id: step.id,
        runId: step.runId,
        seq: step.seq,
        kind: step.kind,
        status: step.status,
        input: step.input,
        output: step.output,
        checkpoint: step.checkpoint,
        startedAt: step.startedAt.toISOString(),
        ...(step.completedAt
          ? { completedAt: step.completedAt.toISOString() }
          : {}),
      },
    });
    await tx.runEvent.create({
      data: {
        id: event.id,
        runId: step.runId,
        sequence: event.sequence,
        type: event.type,
        payload: event as any,
      },
    });
  }
  private async event(
    tx: Prisma.TransactionClient,
    runId: string,
    status: string,
  ) {
    const latest = await tx.runEvent.findFirst({
      where: { runId },
      orderBy: { sequence: 'desc' },
    });
    const event = {
      id: randomUUID(),
      runId,
      sequence: (latest?.sequence ?? -1) + 1,
      occurredAt: new Date().toISOString(),
      type: 'run.status_changed',
      status,
    };
    await tx.runEvent.create({
      data: {
        id: event.id,
        runId,
        sequence: event.sequence,
        type: event.type,
        payload: event,
      },
    });
  }
}
