import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { WorkspaceHostService } from './workspace-host.service';

const registration = {
  hostId: '00000000-0000-4000-8000-000000000001',
  name: 'Ocean Desktop',
  platform: 'darwin',
};

describe('WorkspaceHostService', () => {
  it('issues a one-time credential and stores only its hash', async () => {
    const workspaceHost = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'host-record', ...data, createdAt: new Date(0) })),
    };
    const service = new WorkspaceHostService({ workspaceHost } as never);

    const result = await service.register('user-1', registration);

    expect(result.credential).toMatch(/^ocean_wh_[0-9a-f]{64}$/);
    expect(workspaceHost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        hostId: registration.hostId,
        credentialHash: createHash('sha256').update(result.credential).digest('hex'),
      }),
    });
    expect(workspaceHost.create.mock.calls[0][0].data).not.toHaveProperty('credential');
  });

  it('rotates credentials only for the existing owner', async () => {
    const workspaceHost = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'host-record',
        userId: 'user-1',
        hostId: registration.hostId,
        platform: 'darwin',
      }),
      update: jest.fn(({ data }) => Promise.resolve({
        id: 'host-record',
        ...registration,
        ...data,
        createdAt: new Date(0),
      })),
    };
    const service = new WorkspaceHostService({ workspaceHost } as never);

    const result = await service.register('user-1', registration);

    expect(workspaceHost.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'host-record' },
      data: expect.objectContaining({ revokedAt: null }),
    }));
    expect(result.credential).toMatch(/^ocean_wh_[0-9a-f]{64}$/);
  });

  it('does not allow another account to take over a Host identity', async () => {
    const workspaceHost = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'host-record',
        userId: 'user-1',
        hostId: registration.hostId,
      }),
      update: jest.fn(),
    };
    const service = new WorkspaceHostService({ workspaceHost } as never);

    await expect(service.register('user-2', registration)).rejects.toBeInstanceOf(ConflictException);
    expect(workspaceHost.update).not.toHaveBeenCalled();
  });

  it('authenticates active credentials and rejects revoked or incorrect credentials', async () => {
    const credential = `ocean_wh_${'a'.repeat(64)}`;
    const host = {
      id: 'host-record',
      hostId: registration.hostId,
      platform: 'darwin',
      credentialHash: createHash('sha256').update(credential).digest('hex'),
      revokedAt: null,
      user: { id: 'user-1', workId: 'ocean-user' },
    };
    const workspaceHost = {
      findUnique: jest.fn().mockResolvedValue(host),
      update: jest.fn().mockResolvedValue({}),
    };
    const service = new WorkspaceHostService({ workspaceHost } as never);

    await expect(service.authenticate(registration.hostId, credential)).resolves.toEqual({
      userId: 'user-1',
      workId: 'ocean-user',
      hostId: registration.hostId,
      platform: 'darwin',
      credentialHash: createHash('sha256').update(credential).digest('hex'),
    });
    await expect(service.authenticate(registration.hostId, `ocean_wh_${'b'.repeat(64)}`)).resolves.toBeNull();
    workspaceHost.findUnique.mockResolvedValue({ ...host, revokedAt: new Date() });
    await expect(service.authenticate(registration.hostId, credential)).resolves.toBeNull();
    expect(workspaceHost.update).toHaveBeenCalledTimes(1);
  });
});
