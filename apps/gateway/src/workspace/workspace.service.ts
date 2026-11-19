import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  workspaceConfigurationSchema,
  type WorkspaceConfiguration,
} from '@ocean/contracts';

function parseConfiguration(value: unknown): WorkspaceConfiguration {
  const parsed = workspaceConfigurationSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      `Invalid workspace configuration: ${parsed.error.issues[0]?.message ?? 'invalid data'}`,
    );
  }
  return parsed.data;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class WorkspaceService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  list(userId: string) {
    return this.prisma.workspace.findMany({
      where: { userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, value: unknown) {
    const configuration = parseConfiguration(value);
    return this.prisma.workspace.create({
      data: {
        userId,
        ...configuration,
        roots: toJson(configuration.roots),
        cwd: toJson(configuration.cwd),
        worktree: toJson(configuration.worktree),
      },
    });
  }

  async update(
    userId: string,
    id: string,
    expectedRevision: number,
    value: unknown,
  ) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new BadRequestException('A positive expectedRevision is required');
    }
    const configuration = parseConfiguration(value);
    const result = await this.prisma.workspace.updateMany({
      where: { id, userId, status: 'active', revision: expectedRevision },
      data: {
        ...configuration,
        roots: toJson(configuration.roots),
        cwd: toJson(configuration.cwd),
        worktree: toJson(configuration.worktree),
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      await this.assertCurrentRevision(userId, id);
      throw new ConflictException(
        'Workspace changed since it was loaded; reload before updating',
      );
    }
    return this.prisma.workspace.findUniqueOrThrow({ where: { id } });
  }

  async archive(userId: string, id: string) {
    const result = await this.prisma.workspace.updateMany({
      where: { id, userId, status: 'active' },
      data: { status: 'archived', revision: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw new NotFoundException(`Workspace ${id} not found`);
    }
    return { id, status: 'archived' };
  }

  private async assertCurrentRevision(userId: string, id: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id, userId, status: 'active' },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException(`Workspace ${id} not found`);
  }
}
