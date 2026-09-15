import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CodeService } from './code.service';

describe('CodeService (Phase 6 6c Code 投影)', () => {
  const guardOk = {
    requireAccessibleSpace: jest
      .fn()
      .mockResolvedValue({ id: 'code', type: 'code' }),
  };
  const guardDeny = {
    requireAccessibleSpace: jest
      .fn()
      .mockRejectedValue(new ForbiddenException('denied')),
  };

  function create(overrides: any = {}) {
    const prisma = {
      codeRepository: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'r1', name: 'ocean', diffs: [] }]),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'r1', name: 'ocean', spaceId: 'code' }),
        findFirst:
          overrides.repoFindFirst ?? jest.fn().mockResolvedValue({ id: 'r1' }),
        count: jest.fn().mockResolvedValue(2),
      },
      codeDiff: {
        findMany: jest.fn().mockResolvedValue([{ id: 'd1', reviews: [] }]),
        findFirst:
          overrides.diffFindFirst ?? jest.fn().mockResolvedValue({ id: 'd1' }),
        count: jest.fn().mockResolvedValue(3),
      },
      codeReview: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'rv1', status: 'approved' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'rv1', status: 'changes_requested' }),
      },
      terminalSession: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockResolvedValue({ id: 't1', title: 'shell', spaceId: 'code' }),
        findFirst: jest.fn().mockResolvedValue({ id: 't1', status: 'open' }),
      },
      terminalCommand: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'c1', input: 'ls', spaceId: 'code' }),
      },
      ...(overrides.prisma || {}),
    };
    const space = overrides.guard ?? guardOk;
    return new CodeService(prisma as never, space as never);
  }

  it('listRepositories：限定 Code Space 并返回仓库', async () => {
    const svc = create();
    const repos = await svc.listRepositories('u1');
    expect(repos).toHaveLength(1);
    expect((svc as any).prisma.codeRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: 'code' } }),
    );
  });

  it('createRepository：强制归属 Code Space', async () => {
    const svc = create();
    const repo = await svc.createRepository('u1', {
      name: 'ocean',
      url: 'https://x',
    });
    expect(repo.spaceId).toBe('code');
    expect((svc as any).prisma.codeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ spaceId: 'code' }),
      }),
    );
  });

  it('listDiffs：仓库不在 Code Space 时抛 NotFound', async () => {
    const svc = create({ repoFindFirst: jest.fn().mockResolvedValue(null) });
    await expect(svc.listDiffs('u1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('decideReview：无既有 review 时创建', async () => {
    const svc = create();
    const review = await svc.decideReview('u1', 'd1', {
      status: 'approved',
      comment: 'lgtm',
    });
    expect(review.status).toBe('approved');
  });

  it('无 Membership 用户访问 Code Space → Forbidden（跨 Space 默认拒绝）', async () => {
    const svc = create({ guard: guardDeny });
    await expect(svc.listRepositories('outsider')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('overview：汇总仓库/待审 Diff/我的待审', async () => {
    const svc = create();
    const ov = await svc.overview('u1');
    expect(ov.repoCount).toBe(2);
    expect(ov.openDiffs).toBe(3);
    expect(ov.myPending).toBe(3);
  });

  // ── 终端投影 ──
  it('createTerminal：归属 Code Space', async () => {
    const svc = create();
    const terminal = await svc.createTerminal('u1', { title: 'shell' });
    expect((svc as any).prisma.terminalSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ spaceId: 'code' }),
      }),
    );
  });

  it('recordCommand：命令落 Code Space + 关闭会话自动重开', async () => {
    const updateMock = jest
      .fn()
      .mockResolvedValue({ id: 't1', status: 'open' });
    const svc = create({
      prisma: {
        terminalCommand: {
          create: jest.fn().mockResolvedValue({ id: 'c1', input: 'ls' }),
        },
        terminalSession: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 't1', status: 'closed' }),
          update: updateMock,
        },
      },
    });
    await svc.recordCommand('u1', 't1', {
      input: 'ls',
      output: 'src',
      exitCode: 0,
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'open' } }),
    );
  });

  it('终端不存在时 recordCommand 抛 NotFound', async () => {
    const svc = create({
      prisma: {
        terminalSession: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    });
    await expect(
      svc.recordCommand('u1', 'nope', { input: 'ls' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
