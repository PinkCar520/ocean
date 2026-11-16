import { z } from 'zod';
import type { StoredSession } from '../utils/session-store.js';
import { SessionTaskManager, type Task, type TaskPlanSnapshot } from '../utils/task-manager.js';

export interface PlanStorage {
  load(id: string, workspace: string): Promise<Pick<StoredSession, 'plan' | 'worktree'>>;
  saveWorktree?(id: string, workspace: string, worktree: StoredSession['worktree']): Promise<void>;
  savePlan(id: string, workspace: string, plan: TaskPlanSnapshot): Promise<StoredSession>;
}

export type TaskPlanToolResult =
  | { error: string }
  | (TaskPlanSnapshot & { message: string });

const taskPlanInput = z.object({
  action: z.enum(['start', 'add', 'update', 'list', 'exit']),
  subjects: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  subject: z.string().trim().min(1).max(500).optional(),
  id: z.string().min(1).max(32).optional(),
  status: z.enum(['todo', 'doing', 'done', 'failed']).optional(),
}).superRefine((input, context) => {
  if (input.action === 'start' && (!input.subjects || input.subjects.length === 0)) {
    context.addIssue({ code: 'custom', path: ['subjects'], message: 'start requires 1–100 task subjects.' });
  }
  if (input.action === 'add' && !input.subject) {
    context.addIssue({ code: 'custom', path: ['subject'], message: 'add requires a subject.' });
  }
  if (input.action === 'update' && (!input.id || !input.status)) {
    context.addIssue({ code: 'custom', path: ['id'], message: 'update requires both id and status.' });
  }
});

/** Session-persistent plan and todo tool for Ocean's native coding agent. */
export function createTaskPlanTool(options: {
  workspace: string;
  getSessionId: () => string;
  storage?: PlanStorage;
}) {
  const volatilePlans = new Map<string, TaskPlanSnapshot>();

  return {
    name: 'task_plan',
    description: 'Create and track the current session plan. Use start with ordered task subjects, update task status as work progresses, and call exit before making changes when planning is complete.',
    inputSchema: taskPlanInput,
    async isPlanMode() {
      const sessionId = options.getSessionId();
      if (options.storage) {
        const session = await options.storage.load(sessionId, options.workspace);
        return session.plan?.mode === 'plan';
      }
      return volatilePlans.get(sessionId)?.mode === 'plan';
    },
    async execute(input: z.infer<typeof taskPlanInput>): Promise<TaskPlanToolResult> {
      const sessionId = options.getSessionId();
      try {
        const persisted = options.storage
          ? await options.storage.load(sessionId, options.workspace)
          : undefined;
        const current = persisted?.plan ?? volatilePlans.get(sessionId);
        const manager = new SessionTaskManager(current);
        let plan: TaskPlanSnapshot | null = null;

        switch (input.action) {
          case 'start':
            if (!input.subjects?.length) return { error: 'Provide 1–100 task subjects to start a plan.' };
            plan = manager.start(input.subjects);
            break;
          case 'add':
            if (!input.subject) return { error: 'Provide a subject to add a task.' };
            if ((current?.tasks.length ?? 0) >= 100) return { error: 'A plan can contain at most 100 tasks.' };
            plan = manager.add(input.subject);
            break;
          case 'update':
            if (!input.id || !input.status) return { error: 'Provide a task id and status to update.' };
            plan = manager.update(input.id, input.status as Task['status']);
            if (!plan) return { error: `Task ${input.id} was not found in the active plan.` };
            break;
          case 'list':
            plan = manager.snapshot();
            break;
          case 'exit':
            plan = manager.exit();
            break;
        }

        if (!plan) return { error: 'Unable to resolve the task plan action.' };

        if (input.action !== 'list') {
          if (options.storage) {
            await options.storage.savePlan(sessionId, options.workspace, plan);
          } else {
            volatilePlans.set(sessionId, plan);
          }
        }
        return { ...plan, tasks: plan.tasks, message: statusMessage(input.action, plan) };
      } catch (error) {
        return { error: (error as Error).message || 'Unable to update the task plan.' };
      }
    },
  };
}

function statusMessage(action: string, plan: TaskPlanSnapshot): string {
  if (action === 'exit') return 'Plan mode ended; the task list was cleared.';
  if (action === 'list') return `Current plan has ${plan.tasks.length} task(s).`;
  return `Plan revision ${plan.revision} saved with ${plan.tasks.length} task(s).`;
}
