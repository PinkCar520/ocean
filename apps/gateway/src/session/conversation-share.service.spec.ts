import { ConversationShareService } from './conversation-share.service';

function setup() {
  const prisma = {
    session: { findFirst: jest.fn().mockResolvedValue({ title: 'Snapshot title' }) },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 'recipient', name: 'Recipient', workId: 'WB-1' }]),
      findUnique: jest.fn().mockResolvedValue({ id: 'recipient' }),
    },
    message: { findMany: jest.fn().mockResolvedValue([
      { id: 'root', parentId: null, role: 'user', content: 'Question', parts: null, attachments: [{ url: '/secret' }] },
      { id: 'chosen', parentId: 'root', role: 'assistant', content: 'Fallback', parts: [
        { type: 'reasoning', text: 'Internal reasoning' },
        { type: 'text', text: 'Visible answer' },
        { type: 'tool-result', output: 'Tool output' },
      ] },
      { id: 'sibling', parentId: 'root', role: 'assistant', content: 'Another branch', parts: null },
      { id: 'future', parentId: 'chosen', role: 'user', content: 'Later message', parts: null },
    ]) },
    publicConversationShare: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'public-share' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    conversationShare: {
      create: jest.fn().mockResolvedValue({ id: 'share' }),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { service: new ConversationShareService(prisma as never), prisma };
}

describe('ConversationShareService', () => {
  it('looks up exact Ocean accounts individually without requiring membership in the owner space', async () => {
    const { service, prisma } = setup();
    await expect(service.findRecipient('session', 'owner', 'WB-1')).resolves.toMatchObject({ id: 'recipient' });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { OR: [
        { workId: { equals: 'WB-1', mode: 'insensitive' } },
        { email: { equals: 'WB-1', mode: 'insensitive' } },
      ] },
      select: { id: true, name: true, workId: true },
      take: 2,
    });
  });

  it('captures only the selected persisted branch and its user and assistant text', async () => {
    const { service, prisma } = setup();
    await service.invite('session', 'owner', 'recipient', 'chosen');
    expect(prisma.conversationShare.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sessionId: 'session', recipientId: 'recipient', title: 'Snapshot title',
        messages: [{ role: 'user', text: 'Question' }, { role: 'assistant', text: 'Visible answer' }],
      }),
    }));
  });

  it('rejects unauthorized owners and leaf IDs outside the session before creating an invitation', async () => {
    const { service, prisma } = setup();
    prisma.session.findFirst.mockResolvedValueOnce(null);
    await expect(service.invite('session', 'outsider', 'recipient', 'chosen')).rejects.toThrow('Conversation not found');
    await expect(service.invite('session', 'owner', 'recipient', 'unrelated-leaf')).rejects.toThrow('branch is unavailable');
    expect(prisma.conversationShare.create).not.toHaveBeenCalled();
  });

  it('checks the recipient or owner on every snapshot request and only returns active shares', async () => {
    const { service, prisma } = setup();
    await expect(service.read('share', 'outsider')).rejects.toThrow('Shared conversation not found');
    expect(prisma.conversationShare.findFirst).toHaveBeenCalledWith({
      where: { id: 'share', revokedAt: null, OR: [{ recipientId: 'outsider' }, { session: { userId: 'outsider' } }] },
      select: {
        title: true, messages: true, createdAt: true,
        session: { select: { user: { select: { name: true } } } },
      },
    });
  });

  it('binds revocation to an owned session and clears the stored message snapshot', async () => {
    const { service, prisma } = setup();
    prisma.session.findFirst.mockResolvedValueOnce(null);
    await expect(service.revoke('session', 'outsider', 'share')).rejects.toThrow('Conversation not found');
    expect(prisma.conversationShare.updateMany).not.toHaveBeenCalled();
    await service.revoke('session', 'owner', 'share');
    expect(prisma.conversationShare.updateMany).toHaveBeenCalledWith({
      where: { id: 'share', sessionId: 'session', revokedAt: null },
      data: { revokedAt: expect.any(Date), messages: [] },
    });
  });
  it('only lets the owner publish and reuses the same text snapshot and URL on retry', async () => {
    const { service, prisma } = setup();
    prisma.session.findFirst.mockResolvedValueOnce(null);
    await expect(service.publish('session', 'outsider', 'chosen')).rejects.toThrow('Conversation not found');
    expect(prisma.publicConversationShare.upsert).not.toHaveBeenCalled();

    await expect(service.publish('session', 'owner', 'chosen')).resolves.toEqual({ id: 'public-share' });
    expect(prisma.publicConversationShare.upsert).toHaveBeenCalledWith({
      where: { sessionId: 'session' },
      create: {
        id: expect.any(String), sessionId: 'session', title: 'Snapshot title',
        messages: [{ role: 'user', text: 'Question' }, { role: 'assistant', text: 'Visible answer' }],
      },
      update: { sessionId: 'session' },
      select: { id: true },
    });
  });

  it('checks ownership before unpublishing and uses a separate public lookup', async () => {
    const { service, prisma } = setup();
    prisma.session.findFirst.mockResolvedValueOnce(null);
    await expect(service.unpublish('session', 'outsider')).rejects.toThrow('Conversation not found');
    expect(prisma.publicConversationShare.deleteMany).not.toHaveBeenCalled();

    await service.unpublish('session', 'owner');
    expect(prisma.publicConversationShare.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'session' } });
    expect(prisma.conversationShare.updateMany).not.toHaveBeenCalled();
    await expect(service.readPublic('old-public-id')).rejects.toThrow('Shared conversation not found');
    expect(prisma.publicConversationShare.findUnique).toHaveBeenCalledWith({
      where: { id: 'old-public-id' },
      select: {
        title: true, messages: true, createdAt: true,
        session: { select: { user: { select: { name: true } } } },
      },
    });
  });

  it('exposes the sharer display name without returning the owner relation', async () => {
    const { service, prisma } = setup();
    const snapshot = { title: 'Snapshot', messages: [], createdAt: new Date() };
    const row = { ...snapshot, session: { user: { name: ' Ocean ' } } };
    prisma.publicConversationShare.findUnique.mockResolvedValueOnce(row);
    prisma.conversationShare.findFirst.mockResolvedValueOnce(row);
    await expect(service.readPublic('public-id')).resolves.toEqual({ ...snapshot, sharedBy: 'Ocean' });
    await expect(service.read('private-id', 'recipient')).resolves.toEqual({ ...snapshot, sharedBy: 'Ocean' });
  });
  it('only resolves the original conversation through an owner-scoped lookup', async () => {
    const { service, prisma } = setup();
    await expect(service.originalSession('share', 'viewer')).resolves.toBeNull();
    expect(prisma.publicConversationShare.findFirst).toHaveBeenCalledWith({
      where: { id: 'share', session: { userId: 'viewer' } },
      select: { sessionId: true },
    });
    expect(prisma.conversationShare.findFirst).toHaveBeenCalledWith({
      where: { id: 'share', session: { userId: 'viewer' }, revokedAt: null },
      select: { sessionId: true },
    });
  });

});
