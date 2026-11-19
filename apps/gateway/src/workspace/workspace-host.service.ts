import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const registrationSchema = z
  .object({
    hostId: z.string().uuid(),
    name: z.string().trim().min(1).max(128),
    platform: z.enum(['darwin', 'win32', 'linux']),
  })
  .strict();

function hashCredential(credential: string): Buffer {
  return createHash('sha256').update(credential).digest();
}

@Injectable()
export class WorkspaceHostService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async register(userId: string, value: unknown) {
    const parsed = registrationSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid Workspace Host registration: ${parsed.error.issues[0]?.message ?? 'invalid data'}`,
      );
    }

    const existing = await this.prisma.workspaceHost.findUnique({
      where: { hostId: parsed.data.hostId },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException('Workspace Host is already registered to another user');
    }
    if (existing && existing.platform !== parsed.data.platform) {
      throw new ConflictException('Workspace Host platform cannot be changed');
    }

    const credential = `ocean_wh_${randomBytes(32).toString('hex')}`;
    const credentialHash = hashCredential(credential).toString('hex');
    const host = existing
      ? await this.prisma.workspaceHost.update({
          where: { id: existing.id },
          data: {
            name: parsed.data.name,
            platform: parsed.data.platform,
            credentialHash,
            revokedAt: null,
          },
        })
      : await this.prisma.workspaceHost.create({
          data: {
            userId,
            ...parsed.data,
            credentialHash,
          },
        });

    return {
      id: host.id,
      hostId: host.hostId,
      name: host.name,
      platform: host.platform,
      credential,
      createdAt: host.createdAt,
    };
  }

  async revoke(userId: string, hostId: string) {
    const result = await this.prisma.workspaceHost.updateMany({
      where: { userId, hostId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new ConflictException('Workspace Host is not registered or is already revoked');
    }
    return { hostId, revoked: true };
  }

  async authenticate(hostId: unknown, credential: unknown) {
    if (
      typeof hostId !== 'string' ||
      typeof credential !== 'string' ||
      !/^ocean_wh_[0-9a-f]{64}$/.test(credential)
    ) {
      return null;
    }
    const host = await this.prisma.workspaceHost.findUnique({
      where: { hostId },
      include: { user: { select: { id: true, workId: true } } },
    });
    if (!host || host.revokedAt) return null;
    const expected = Buffer.from(host.credentialHash, 'hex');
    const supplied = hashCredential(credential);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return null;
    }
    await this.prisma.workspaceHost.update({
      where: { id: host.id },
      data: { lastSeenAt: new Date() },
    });
    return {
      userId: host.user.id,
      workId: host.user.workId,
      hostId: host.hostId,
      platform: host.platform,
      credentialHash: host.credentialHash,
    };
  }

  async isActive(hostId: string, credentialHash: string): Promise<boolean> {
    const host = await this.prisma.workspaceHost.findUnique({
      where: { hostId },
      select: { credentialHash: true, revokedAt: true },
    });
    if (!host || host.revokedAt) return false;
    const current = Buffer.from(host.credentialHash, 'hex');
    const supplied = Buffer.from(credentialHash, 'hex');
    return current.length === supplied.length && timingSafeEqual(current, supplied);
  }
}
