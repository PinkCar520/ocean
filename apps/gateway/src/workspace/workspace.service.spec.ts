import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

const configuration = {
  name: 'Ocean Workspace',
  hostId: '00000000-0000-4000-8000-000000000002',
  platform: 'darwin',
  roots: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      label: 'Ocean',
      path: '/Users/example/Ocean',
      role: 'primary',
      access: 'read_write',
    },
  ],
  cwd: {
    rootId: '00000000-0000-4000-8000-000000000003',
    relativePath: '.',
  },
  worktree: { enabled: false },
};

function createService(workspace: Record<string, jest.Mock>) {
  return new WorkspaceService({ workspace } as never);
}

describe('WorkspaceService', () => {
  it('creates a validated, user-owned Workspace configuration', async () => {
    const workspace = {
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(args.data),
      ),
    };
    const service = createService(workspace);

    await service.create('user-1', configuration);

    const data = workspace.create.mock.calls[0]?.[0].data;
    expect(data).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        name: configuration.name,
        hostId: configuration.hostId,
      }),
    );
    expect(data).not.toHaveProperty('revision');
  });

  it('rejects invalid configurations before persistence', async () => {
    const workspace = { create: jest.fn() };
    const service = createService(workspace);

    await expect(
      service.create('user-1', {
        ...configuration,
        roots: configuration.roots.map((root) => ({
          ...root,
          role: 'additional',
        })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(workspace.create).not.toHaveBeenCalled();
  });

  it('uses optimistic revision checks when updating', async () => {
    const workspace = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    };
    const service = createService(workspace);

    await expect(
      service.update('user-1', 'workspace-1', 1, configuration),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(workspace.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'workspace-1',
          userId: 'user-1',
          status: 'active',
          revision: 1,
        },
        data: expect.objectContaining({
          revision: { increment: 1 },
        }),
      }),
    );
  });

  it('does not disclose or modify a Workspace owned by another user', async () => {
    const workspace = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    const service = createService(workspace);

    await expect(
      service.update('user-1', 'workspace-1', 1, configuration),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives without deleting Session snapshots', async () => {
    const workspace = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const service = createService(workspace);

    await expect(service.archive('user-1', 'workspace-1')).resolves.toEqual({
      id: 'workspace-1',
      status: 'archived',
    });
    expect(workspace.updateMany).toHaveBeenCalledWith({
      where: { id: 'workspace-1', userId: 'user-1', status: 'active' },
      data: { status: 'archived', revision: { increment: 1 } },
    });
  });
});
