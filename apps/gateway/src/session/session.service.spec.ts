import { SessionService } from './session.service';

describe('SessionService.addMessage', () => {
  function createService() {
    const prisma = {
      message: {
        findFirst: jest.fn(() => Promise.resolve({ id: 'previous-message' })),
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          void args;
          return Promise.resolve({ id: 'new-message' });
        }),
      },
      session: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return {
      service: new SessionService(prisma as never, {} as never),
      prisma,
    };
  }

  it('preserves an explicit null parent for a new conversation branch', async () => {
    const { service, prisma } = createService();

    await service.addMessage('session-1', {
      role: 'user',
      content: 'start a new branch',
      parentId: null,
    });

    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(
      prisma.message.create.mock.calls[0]?.[0].data.parentId,
    ).toBeUndefined();
  });

  it('uses the latest message as parent when no parent is provided', async () => {
    const { service, prisma } = createService();

    await service.addMessage('session-1', {
      role: 'user',
      content: 'continue',
    });

    expect(prisma.message.findFirst).toHaveBeenCalled();
    expect(prisma.message.create.mock.calls[0]?.[0].data.parentId).toBe(
      'previous-message',
    );
  });
});
