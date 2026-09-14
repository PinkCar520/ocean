import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  agentRunSchema,
  runEventSchema,
  runSnapshotSchema,
  type AgentRun,
  type CreateRunRequest,
  type RunEvent,
  type RunSnapshot,
} from '@ocean/contracts';
import { OutboxService } from './outbox.service';

const CANCELLABLE_STATUSES = new Set([
  'queued',
  'running',
  'waiting_for_approval',
  'waiting_for_input',
  'paused',
]);

@Injectable()
export class RunService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly outbox: OutboxService,
  ) {}

  async create(userId: string, request: CreateRunRequest): Promise<RunSnapshot> {
    if (request.idempotencyKey) {
      const existing = await this.prisma.agentRun.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: request.idempotencyKey } },
      });
      if (existing) return this.get(existing.id, userId);
    }

    return this.prisma.$transaction(async transaction => {
      const run = await transaction.agentRun.create({
        data: {
          userId,
          spaceId: request.space.id,
          spaceType: request.space.type,
          input: request.input,
          status: 'queued',
          idempotencyKey: request.idempotencyKey,
          metadata: request.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      const event = runEventSchema.parse({
        id: crypto.randomUUID(),
        runId: run.id,
        sequence: 0,
        occurredAt: run.createdAt.toISOString(),
        type: 'run.created',
        status: 'queued',
      });
      await transaction.runEvent.create({
        data: {
          id: event.id,
          runId: run.id,
          sequence: event.sequence,
          type: event.type,
          payload: event as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
        },
      });
      await this.outbox.enqueueRunRequested(transaction, {
        version: 1,
        runId: run.id,
        userId,
      });
      return runSnapshotSchema.parse({ run: this.toContract(run), events: [event] });
    });
  }

  async get(id: string, userId: string): Promise<RunSnapshot> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    if (run.userId !== userId) throw new ForbiddenException(`Run ${id} does not belong to current user`);

    return runSnapshotSchema.parse({
      run: this.toContract(run),
      events: run.events.map(event => runEventSchema.parse(event.payload)),
    });
  }

  async cancel(id: string, userId: string): Promise<RunSnapshot> {
    const snapshot = await this.get(id, userId);
    if (!CANCELLABLE_STATUSES.has(snapshot.run.status)) return snapshot;

    return this.prisma.$transaction(async transaction => {
      const run = await transaction.agentRun.update({
        where: { id },
        data: { status: 'cancelled' },
      });
      const sequence = snapshot.events.at(-1)?.sequence ?? -1;
      const event = runEventSchema.parse({
        id: crypto.randomUUID(),
        runId: run.id,
        sequence: sequence + 1,
        occurredAt: run.updatedAt.toISOString(),
        type: 'run.status_changed',
        status: 'cancelled',
      });
      await transaction.runEvent.create({
        data: {
          id: event.id,
          runId: run.id,
          sequence: event.sequence,
          type: event.type,
          payload: event as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
        },
      });
      return runSnapshotSchema.parse({ run: this.toContract(run), events: [...snapshot.events, event] });
    });
  }

  private toContract(run: {
    id: string;
    userId: string;
    spaceId: string;
    spaceType: string;
    input: string;
    status: string;
    idempotencyKey: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): AgentRun {
    return agentRunSchema.parse({
      id: run.id,
      userId: run.userId,
      space: { id: run.spaceId, type: run.spaceType },
      input: run.input,
      status: run.status,
      idempotencyKey: run.idempotencyKey ?? null,
      metadata: run.metadata ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    });
  }
}
