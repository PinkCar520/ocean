import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../utils/session-store.js';
import { createTaskPlanTool, type TaskPlanToolResult } from './task-plan.js';

function assertPlan(result: TaskPlanToolResult): asserts result is Exclude<TaskPlanToolResult, { error: string }> {
  if ('error' in result) throw new Error(result.error);
}

describe('CLI native session task plan', () => {
  let tempRoot = '';

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it('persists plan revisions and task state with the active session', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-task-plan-'));
    const workspace = path.join(tempRoot, 'workspace');
    const store = new SessionStore(path.join(tempRoot, 'sessions'));
    const session = await store.create(workspace);
    const tool = createTaskPlanTool({
      workspace,
      getSessionId: () => session.id,
      storage: store,
    });

    const started = await tool.execute({ action: 'start', subjects: ['Inspect', 'Implement', 'Verify'] });
    assertPlan(started);
    expect(started).toMatchObject({ mode: 'plan', revision: 1 });
    expect(started.tasks).toHaveLength(3);
    expect(started.tasks[0]).toMatchObject({ id: '1', status: 'todo' });
    expect(await tool.isPlanMode()).toBe(true);

    const progressed = await tool.execute({ action: 'update', id: '1', status: 'done' });
    assertPlan(progressed);
    expect(progressed).toMatchObject({ revision: 2 });
    expect(progressed.tasks[0]).toMatchObject({ id: '1', status: 'done' });
    expect((await store.load(session.id, workspace)).plan).toMatchObject({
      revision: 2,
      mode: 'plan',
      tasks: progressed.tasks,
    });

    const exited = await tool.execute({ action: 'exit' });
    assertPlan(exited);
    expect(exited).toMatchObject({ mode: 'auto', revision: 3, tasks: [] });
    expect(await tool.isPlanMode()).toBe(false);
  });

  it('isolates plans by session and requires valid action fields', async () => {
    const active = { id: 'session-a' };
    const tool = createTaskPlanTool({
      workspace: tempRoot || os.tmpdir(),
      getSessionId: () => active.id,
    });

    await tool.execute({ action: 'start', subjects: ['A task'] });
    active.id = 'session-b';
    expect(await tool.execute({ action: 'list' })).toMatchObject({ mode: 'auto', tasks: [] });
    expect(await tool.execute({ action: 'update', id: 'missing', status: 'done' })).toHaveProperty('error');
  });
});
