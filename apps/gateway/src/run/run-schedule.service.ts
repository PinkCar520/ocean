import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { spaceRefSchema } from '@ocean/contracts';
import { SpaceService } from '../space/space.service';
import { nextCronTime } from './cron';
import { RunService } from './run.service';

export const createScheduleSchema = z.object({
  spaceId: z.string().min(1).max(200).default('work'),
  prompt: z.string().trim().min(1).max(32_000),
  cron: z.string().trim().min(1).max(120),
  recurring: z.boolean().default(true),
}).strict();

@Injectable()
export class RunScheduleService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly db: PrismaClient,
    private readonly spaces: SpaceService,
    private readonly runs: RunService,
  ) {}

  async create(userId: string, body: unknown, id?: string) {
    const parsed = createScheduleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid Run schedule.');
    const { cron, prompt, spaceId, recurring } = parsed.data;
    let nextRunAt: Date;
    try { nextRunAt = nextCronTime(cron, new Date()); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    await this.spaces.requireAccessibleSpace(userId, spaceId);
    const data = { userId, spaceId, cron, prompt, recurring, nextRunAt };
    if (!id) return this.db.runSchedule.create({ data });
    const record = await this.db.runSchedule.upsert({
      where: { id },
      update: {},
      create: { ...data, id },
    });
    if (record.userId !== userId || record.spaceId !== spaceId
      || record.cron !== cron || record.prompt !== prompt || record.recurring !== recurring) {
      throw new BadRequestException('Schedule identity was reused with different input.');
    }
    return record;
  }

  list(userId: string, spaceId?: string) {
    return this.db.runSchedule.findMany({ where: { userId, spaceId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async disable(userId: string, id: string, spaceId?: string) {
    const update = await this.db.runSchedule.updateMany({
      where: { id, userId, spaceId },
      data: { active: false, nextRunAt: null },
    });
    if (!update.count) throw new NotFoundException('Run schedule not found.');
    return { id, active: false };
  }

  async dispatchDue(now = new Date()) {
    const due = await this.db.runSchedule.findMany({
      where: { active: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      select: { id: true },
      take: 32,
    });

    const results = await Promise.allSettled(due.map(({ id }) => this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM run_schedules WHERE id = ${id} AND active AND "nextRunAt" <= ${now} FOR UPDATE SKIP LOCKED`,
      );
      if (locked.length === 0) return;
      const schedule = await tx.runSchedule.findUniqueOrThrow({ where: { id } });
      const membership = await tx.membership.findUnique({
        where: { spaceId_userId: { spaceId: schedule.spaceId, userId: schedule.userId } },
        select: { space: { select: { id: true, type: true } } },
      });
      if (!membership) {
        await tx.runSchedule.update({ where: { id }, data: { active: false, nextRunAt: null } });
        return;
      }
      const space = spaceRefSchema.parse(membership.space);
      const snapshot = await this.runs.createInTransaction(tx, schedule.userId, {
        space,
        input: schedule.prompt,
        priority: 'background',
        metadata: { scheduleId: id, nonInteractive: true },
      }, space);
      await tx.runSchedule.update({
        where: { id },
        data: {
          active: schedule.recurring,
          nextRunAt: schedule.recurring ? nextCronTime(schedule.cron, now) : null,
          lastRunId: snapshot.run.id,
        },
      });
    })));
    const failure = results.find((entry) => entry.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}
