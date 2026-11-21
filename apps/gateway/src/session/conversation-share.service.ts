import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const inviteSelect = {
  id: true,
  createdAt: true,
  recipient: { select: { name: true, workId: true, avatar: true, email: true } },
} satisfies Prisma.ConversationShareSelect;

const snapshotSelect = {
  title: true,
  messages: true,
  createdAt: true,
  session: { select: { user: { select: { name: true } } } },
} as const;

function sharedSnapshot({ session, ...snapshot }: {
  session: { user: { name: string | null } };
  title: string;
  messages: Prisma.JsonValue;
  createdAt: Date;
}) {
  return { ...snapshot, sharedBy: session.user.name?.trim() || null };
}

@Injectable()
export class ConversationShareService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  private async ownedSession(sessionId: string, userId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { title: true },
    });
    if (!session) throw new NotFoundException('Conversation not found.');
    return session;
  }

  async list(sessionId: string, ownerId: string) {
    await this.ownedSession(sessionId, ownerId);
    const [data, publicShare] = await Promise.all([
      this.prisma.conversationShare.findMany({
        where: { sessionId, revokedAt: null },
        select: inviteSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.publicConversationShare.findUnique({
        where: { sessionId },
        select: { id: true },
      }),
    ]);
    return { data, publicShareId: publicShare?.id ?? null };
  }

  async findRecipient(sessionId: string, ownerId: string, identifier: string) {
    await this.ownedSession(sessionId, ownerId);
    const recipients = await this.prisma.user.findMany({
      where: { OR: [
        { workId: { equals: identifier, mode: 'insensitive' } },
        { email: { equals: identifier, mode: 'insensitive' } },
      ] },
      select: { id: true, name: true, workId: true },
      take: 2,
    });
    const recipient = recipients[0];
    if (recipients.length !== 1 || !recipient || recipient.id === ownerId) {
      throw new BadRequestException('Enter the email or work ID of another Ocean account.');
    }
    return recipient;
  }

  async invite(sessionId: string, ownerId: string, recipientId: string, leafId: string) {
    const session = await this.ownedSession(sessionId, ownerId);
    if (recipientId === ownerId || !await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    })) {
      throw new BadRequestException('The selected account is unavailable.');
    }

    const messages = await this.snapshotMessages(sessionId, leafId);
    const newShare = { id: randomUUID(), title: session.title, messages, createdAt: new Date() };
    try {
      return await this.prisma.conversationShare.create({
        data: { ...newShare, sessionId, recipientId },
        select: inviteSelect,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }

    // Reinviting after revocation gets a new URL. The revoked URL must stay invalid.
    return this.prisma.$transaction(async tx => {
      const restored = await tx.conversationShare.updateMany({
        where: { sessionId, recipientId, revokedAt: { not: null } },
        data: { ...newShare, revokedAt: null },
      });
      if (!restored.count) throw new ConflictException('This account already has access. Revoke its invitation to share a new snapshot.');
      return tx.conversationShare.findUniqueOrThrow({ where: { id: newShare.id }, select: inviteSelect });
    });
  }

  private async snapshotMessages(sessionId: string, leafId: string) {
    const rows = await this.prisma.message.findMany({
      where: { sessionId },
      select: { id: true, parentId: true, role: true, content: true, parts: true },
    });
    const byId = new Map(rows.map(message => [message.id, message]));
    const messages: Array<{ role: 'user' | 'assistant'; text: string }> = [];
    let nextId: string | null = leafId;
    while (nextId) {
      const message = byId.get(nextId);
      if (!message) throw new BadRequestException('The selected conversation branch is unavailable.');
      byId.delete(nextId);
      nextId = message.parentId;
      if (message.role !== 'user' && message.role !== 'assistant') continue;
      const textParts = Array.isArray(message.parts) ? message.parts.flatMap(part =>
        part && typeof part === 'object' && !Array.isArray(part) && part.type === 'text' && typeof part.text === 'string'
          ? [part.text] : [],
      ) : [];
      const text = textParts.length ? textParts.join('') : message.content;
      if (text.trim()) messages.push({ role: message.role, text });
    }

    if (!messages.length || Buffer.byteLength(JSON.stringify(messages)) > 2 * 1024 * 1024) {
      throw new BadRequestException('The selected branch is empty or exceeds the share size limit.');
    }
    messages.reverse();
    return messages;
  }

  async publish(sessionId: string, ownerId: string, leafId: string) {
    const { title } = await this.ownedSession(sessionId, ownerId);
    const messages = await this.snapshotMessages(sessionId, leafId);
    return this.prisma.publicConversationShare.upsert({
      where: { sessionId },
      create: { id: randomUUID(), sessionId, title, messages },
      // Retrying must keep the original snapshot and URL until explicitly revoked.
      update: { sessionId },
      select: { id: true },
    });
  }

  async unpublish(sessionId: string, ownerId: string) {
    await this.ownedSession(sessionId, ownerId);
    await this.prisma.publicConversationShare.deleteMany({ where: { sessionId } });
  }

  async originalSession(id: string, ownerId: string) {
    const where = { id, session: { userId: ownerId } };
    const select = { sessionId: true };
    const [publicShare, invitation] = await Promise.all([
      this.prisma.publicConversationShare.findFirst({ where, select }),
      this.prisma.conversationShare.findFirst({ where: { ...where, revokedAt: null }, select }),
    ]);
    return publicShare?.sessionId ?? invitation?.sessionId ?? null;
  }

  async readPublic(id: string) {
    const snapshot = await this.prisma.publicConversationShare.findUnique({
      where: { id },
      select: snapshotSelect,
    });
    if (!snapshot) throw new NotFoundException('Shared conversation not found.');
    return sharedSnapshot(snapshot);
  }

  async revoke(sessionId: string, ownerId: string, id: string) {
    await this.ownedSession(sessionId, ownerId);
    await this.prisma.conversationShare.updateMany({
      where: { id, sessionId, revokedAt: null },
      data: { revokedAt: new Date(), messages: [] },
    });
  }

  async read(id: string, userId: string) {
    const snapshot = await this.prisma.conversationShare.findFirst({
      where: {
        id,
        revokedAt: null,
        OR: [{ recipientId: userId }, { session: { userId } }],
      },
      select: snapshotSelect,
    });
    if (!snapshot) throw new NotFoundException('Shared conversation not found.');
    return sharedSnapshot(snapshot);
  }
}
