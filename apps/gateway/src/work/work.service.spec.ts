import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WorkService } from './work.service';

describe('WorkService (Phase 6 6d Work 投影)', () => {
  const guardOk = { requireAccessibleSpace: jest.fn().mockResolvedValue({ id: 'work', type: 'work' }) };
  const guardDeny = { requireAccessibleSpace: jest.fn().mockRejectedValue(new ForbiddenException('denied')) };

  function create(overrides: any = {}) {
    const prisma = {
      workProject: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Ocean v2', tasks: [] }]),
        create: jest.fn().mockResolvedValue({ id: 'p1', name: 'Ocean v2', spaceId: 'work' }),
        findFirst: overrides.projectFindFirst ?? jest.fn().mockResolvedValue({ id: 'p1' }),
      },
      workTask: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([{ id: 't1', status: 'todo' }]),
        create: jest.fn().mockResolvedValue({ id: 't1', title: 'task', spaceId: 'work' }),
        findFirst: overrides.taskFindFirst ?? jest.fn().mockResolvedValue({ id: 't1' }),
        update: jest.fn().mockResolvedValue({ id: 't1', status: 'done' }),
      },
      ...(overrides.prisma || {}),
    };
    const space = overrides.guard ?? guardOk;
    return new WorkService(prisma as never, space as never);
  }

  it('listProjects：限定 Work Space', async () => {
    const svc = create();
    const projects = await svc.listProjects('u1');
    expect(projects).toHaveLength(1);
    expect((svc as any).prisma.workProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: 'work' } }),
    );
  });

  it('createProject：owner=调用者 + 强制归属 Work Space', async () => {
    const svc = create();
    const project = await svc.createProject('u1', { name: 'Ocean v2' });
    expect(project.spaceId).toBe('work');
    expect((svc as any).prisma.workProject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: 'u1', spaceId: 'work' }) }),
    );
  });

  it('createTask：任务强制 Work Space + 项目归属校验', async () => {
    const svc = create();
    const task = await svc.createTask('u1', 'p1', { title: 't' });
    expect(task.spaceId).toBe('work');
  });

  it('项目不存在时 createTask 抛 NotFound', async () => {
    const svc = create({ projectFindFirst: jest.fn().mockResolvedValue(null) });
    await expect(svc.createTask('u1', 'nope', { title: 't' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateTask：状态流转 + 改派', async () => {
    const svc = create();
    const task = await svc.updateTask('u1', 't1', { status: 'done', assigneeId: 'u2' });
    expect(task.status).toBe('done');
  });

  it('无 Membership 用户 → Forbidden', async () => {
    const svc = create({ guard: guardDeny });
    await expect(svc.listProjects('outsider')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
