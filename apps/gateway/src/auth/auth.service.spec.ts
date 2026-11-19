import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { PrismaClient } from '@prisma/client';

describe('login device sessions', () => {
  const prisma = {
    loginSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const jwt = new JwtService({ secret: 'test-signing-key' });
  const service = new AuthService(prisma as unknown as PrismaClient, jwt);

  beforeEach(() => jest.clearAllMocks());

  it('records separate devices and ends only the presented session', async () => {
    const user = { id: 'user-1', workId: 'work-1' };
    const first = await service.login(user, 'Desktop');
    const second = await service.login(user, 'Browser');
    const firstSession = jwt.verify(first.access_token);
    const secondSession = jwt.verify(second.access_token);

    expect(firstSession.jti).not.toBe(secondSession.jti);
    expect(prisma.loginSession.create).toHaveBeenCalledWith({
      data: {
        id: firstSession.jti,
        userId: user.id,
        userAgent: 'Desktop',
        location: undefined,
        expiresAt: expect.any(Date),
      },
    });
    await service.endLoginSession(first.access_token);
    expect(prisma.loginSession.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.loginSession.deleteMany).toHaveBeenCalledWith({
      where: { id: firstSession.jti, userId: user.id },
    });
  });

  it('scopes remote device sign-out to the authenticated account', async () => {
    await service.revokeLoginSession('user-1', 'target-session');
    expect(prisma.loginSession.deleteMany).toHaveBeenCalledWith({
      where: { id: 'target-session', userId: 'user-1' },
    });
  });

  it('lists only currently valid sessions for the signed-in user', async () => {
    await service.listLoginSessions('user-1');
    expect(prisma.loginSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', expiresAt: { gt: expect.any(Date) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userAgent: true, location: true, createdAt: true, lastActiveAt: true },
    });
  });
});
