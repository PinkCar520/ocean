import { SessionService } from './session.service';

const workspaceSnapshot = {
  name: 'Project Workspace',
  schemaVersion: 1,
  workspaceId: '00000000-0000-4000-8000-000000000001',
  workspaceRevision: 1,
  hostId: '00000000-0000-4000-8000-000000000002',
  platform: 'darwin',
  roots: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      label: 'Project',
      path: '/Users/user/project',
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

const persistedWorkspace = {
  id: workspaceSnapshot.workspaceId,
  userId: 'user-1',
  name: workspaceSnapshot.name,
  hostId: workspaceSnapshot.hostId,
  platform: workspaceSnapshot.platform,
  roots: workspaceSnapshot.roots,
  cwd: workspaceSnapshot.cwd,
  worktree: workspaceSnapshot.worktree,
  revision: 1,
  status: 'active',
};

function createService() {
  const prisma = {
    message: {
      findFirst: jest.fn(() => Promise.resolve({ id: 'previous-message' })),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        void args;
        return Promise.resolve({ id: 'new-message' });
      }),
    },
    knowledgeProject: {
      findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
    },
    session: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', spaceId: 'work' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(args.data),
      ),
    },
    workspace: {
      findFirst: jest.fn(
        (): Promise<typeof persistedWorkspace | null> =>
          Promise.resolve(persistedWorkspace),
      ),
    },
  };
  const spaceService = {
    assertAccess: jest.fn().mockResolvedValue(undefined),
    requireAccessibleSpace: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new SessionService(prisma as never, spaceService as never),
    prisma,
  };
}

describe('SessionService.addMessage', () => {
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

describe('SessionService.createSession workspace binding', () => {
  it('stores the selected folder on a Work session', async () => {
    const { service, prisma } = createService();

    await service.createSession(
      'user-1',
      'desktop',
      'New Chat',
      undefined,
      'work',
      '/Users/user/project',
    );

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        spaceId: 'work',
        workspacePath: '/Users/user/project',
      }),
    });
  });

  it('returns the bound folder in the session summary', async () => {
    const { service, prisma } = createService();
    prisma.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        title: 'Review repository',
        channel: 'desktop',
        status: 'active',
        activeSkillId: null,
        spaceId: 'work',
        workspacePath: '/Users/user/project',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        _count: { messages: 1 },
      },
    ]);

    const sessions = await service.getSessions('user-1', 'work');

    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: 'session-1',
        workspacePath: '/Users/user/project',
      }),
    );
  });

  it('validates and stores a structured workspace snapshot', async () => {
    const { service, prisma } = createService();

    await service.createSession(
      'user-1',
      'desktop',
      'New Chat',
      undefined,
      'work',
      undefined,
      workspaceSnapshot,
    );

    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspacePath: '/Users/user/project',
        workspaceId: workspaceSnapshot.workspaceId,
        workspaceSnapshot,
      }),
    });
  });

  it('rejects a workspace snapshot that does not match the legacy path', async () => {
    const { service, prisma } = createService();

    await expect(
      service.createSession(
        'user-1',
        'desktop',
        'New Chat',
        undefined,
        'work',
        '/Users/user/other',
        workspaceSnapshot,
      ),
    ).rejects.toThrow('Workspace path must match the snapshot primary root');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('rejects a snapshot if the persisted Workspace revision changed', async () => {
    const { service, prisma } = createService();
    prisma.workspace.findFirst.mockResolvedValue({
      ...persistedWorkspace,
      revision: 2,
    });

    await expect(
      service.createSession(
        'user-1',
        'desktop',
        'New Chat',
        undefined,
        'work',
        undefined,
        workspaceSnapshot,
      ),
    ).rejects.toThrow('Workspace changed since it was selected');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('does not attach another user’s Workspace', async () => {
    const { service, prisma } = createService();
    prisma.workspace.findFirst.mockResolvedValue(null);

    await expect(
      service.createSession(
        'user-1',
        'desktop',
        'New Chat',
        undefined,
        'work',
        undefined,
        workspaceSnapshot,
      ),
    ).rejects.toThrow('Workspace 00000000-0000-4000-8000-000000000001 not found');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('does not allow a local folder to be attached to a Life session', async () => {
    const { service, prisma } = createService();

    await expect(
      service.createSession(
        'user-1',
        'desktop',
        'New Chat',
        undefined,
        'life',
        '/Users/user/private',
      ),
    ).rejects.toThrow(
      'A local workspace folder can only be attached to a Work session',
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('rejects invalid workspace paths', async () => {
    const { service, prisma } = createService();

    await expect(
      service.createSession(
        'user-1',
        'desktop',
        'New Chat',
        undefined,
        'work',
        '   ',
      ),
    ).rejects.toThrow('Invalid workspace path');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

describe('SessionService conversation metadata', () => {
  it('persists pins and projects after checking the session and project scope', async () => {
    const { service, prisma } = createService();
    await service.updateSession('session-1', 'user-1', { pinned: true, projectId: 'project-1' });

    expect(prisma.knowledgeProject.findFirst).toHaveBeenCalledWith({
      where: { id: 'project-1', spaceId: 'work', OR: [{ isPublic: true }, { userId: 'user-1' }] },
      select: { id: true },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { pinned: true, projectId: 'project-1', updatedAt: expect.any(Date) },
    });
  });

  it('rejects updates by another user and projects outside the accessible space', async () => {
    const { service, prisma } = createService();
    prisma.knowledgeProject.findFirst.mockResolvedValue(null);
    await expect(service.updateSession('session-1', 'user-2', { pinned: true })).rejects.toThrow('does not belong');
    await expect(service.updateSession('session-1', 'user-1', { projectId: 'other-project' })).rejects.toThrow('unavailable');
    expect(prisma.session.update).not.toHaveBeenCalled();
  });
});
