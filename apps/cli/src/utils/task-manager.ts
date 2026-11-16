export interface Task {
  id: string;
  subject: string;
  status: 'todo' | 'doing' | 'done' | 'failed';
  description?: string;
  activeForm?: string;
  owner?: string;
  metadata?: Record<string, unknown>;
  blockedBy?: string[];
}

export type WorkMode = 'auto' | 'plan';

export interface TaskPlanSnapshot {
  revision: number;
  mode: WorkMode;
  tasks: Task[];
  nextId?: number;
}

export type TaskChanges = Partial<Pick<Task, 'subject' | 'description' | 'activeForm' | 'owner' | 'status' | 'metadata'>> & {
  addBlocks?: string[];
  addBlockedBy?: string[];
};

export function formatTaskPlan(plan?: TaskPlanSnapshot): string {
  if (!plan?.tasks.length) return plan?.mode === 'plan' ? 'Plan mode is active; no tasks have been added.' : 'No task plan in this session.';
  const statusIcon: Record<Task['status'], string> = {
    todo: '○',
    doing: '◐',
    done: '✓',
    failed: '✗',
  };
  return [
    `Plan mode: ${plan.mode} · revision ${plan.revision}`,
    ...plan.tasks.map((task) => `${statusIcon[task.status]} ${task.id}. ${task.subject}${task.owner ? ` [${task.owner}]` : ''}${task.blockedBy?.length ? ` ← ${task.blockedBy.join(', ')}` : ''}`),
  ].join('\n');
}

export type TaskPlanAction = 'start' | 'add' | 'update' | 'list' | 'get' | 'delete' | 'exit';

/**
 * A task plan scoped to one persisted Ocean session. The legacy static manager
 * below remains for the daemon RPC bridge; interactive agent sessions use this
 * instance so two sessions cannot overwrite each other's plans.
 */
export class SessionTaskManager {
  private plan: TaskPlanSnapshot;

  constructor(snapshot?: TaskPlanSnapshot) {
    this.plan = clonePlan(snapshot ?? { revision: 0, mode: 'auto', tasks: [] });
  }

  start(subjects: string[]): TaskPlanSnapshot {
    this.plan = {
      revision: this.plan.revision + 1,
      mode: 'plan',
      tasks: subjects.map((subject, index) => ({ id: String(index + 1), subject, status: 'todo' })),
    };
    return this.snapshot();
  }

  add(subject: string, details: Omit<TaskChanges, 'status' | 'subject' | 'addBlocks' | 'addBlockedBy'> = {}): TaskPlanSnapshot {
    if (this.plan.tasks.length >= 100) throw new Error('A plan can contain at most 100 tasks.');
    const nextId = Math.max(this.plan.nextId ?? 1, this.plan.tasks.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0) + 1);
    this.plan = {
      ...this.plan,
      revision: this.plan.revision + 1,
      nextId: nextId + 1,
      tasks: [...this.plan.tasks, { ...structuredClone(details), id: String(nextId), subject, status: 'todo' }],
    };
    return this.snapshot();
  }

  update(id: string, changes: Task['status'] | TaskChanges): TaskPlanSnapshot | null {
    if (!this.plan.tasks.some((task) => task.id === id)) return null;
    const patch = typeof changes === 'string' ? { status: changes } : changes;
    const candidate = this.snapshot();
    const target = candidate.tasks.find(task => task.id === id)!;
    const { addBlocks, addBlockedBy, metadata, ...fields } = patch;
    Object.assign(target, fields);
    if (metadata !== undefined) {
      const merged = new Map(Object.entries(target.metadata ?? {}));
      for (const [key, value] of Object.entries(metadata)) {
        if (value === null) merged.delete(key);
        else merged.set(key, structuredClone(value));
      }
      target.metadata = Object.fromEntries(merged);
    }
    const link = (blocker: string, dependent: string) => {
      const blocked = candidate.tasks.find(task => task.id === dependent);
      if (!blocked || !candidate.tasks.some(task => task.id === blocker)) throw new Error('Dependency task was not found.');
      blocked.blockedBy = [...new Set([...(blocked.blockedBy ?? []), blocker])];
    };
    for (const blocker of addBlockedBy ?? []) link(blocker, id);
    for (const dependent of addBlocks ?? []) link(id, dependent);
    validateTaskGraph(candidate.tasks);
    if (patch.status === 'doing' || patch.status === 'done') {
      const unresolved = (target.blockedBy ?? []).filter(blocker => candidate.tasks.find(task => task.id === blocker)?.status !== 'done');
      if (unresolved.length) throw new Error(`Task is blocked by unfinished tasks: ${unresolved.join(', ')}.`);
    }
    candidate.revision += 1;
    this.plan = candidate;
    return this.snapshot();
  }

  delete(id: string): TaskPlanSnapshot | null {
    if (!this.plan.tasks.some(task => task.id === id)) return null;
    this.plan = {
      ...this.plan,
      nextId: this.plan.nextId ?? this.plan.tasks.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0) + 1,
      revision: this.plan.revision + 1,
      tasks: this.plan.tasks.filter(task => task.id !== id).map(task => ({
        ...task, blockedBy: task.blockedBy?.filter(blocker => blocker !== id),
      })),
    };
    return this.snapshot();
  }

  exit(): TaskPlanSnapshot {
    this.plan = { ...this.plan, revision: this.plan.revision + 1, mode: 'auto' };
    return this.snapshot();
  }

  snapshot(): TaskPlanSnapshot {
    return clonePlan(this.plan);
  }
}

function clonePlan(plan: TaskPlanSnapshot): TaskPlanSnapshot {
  return structuredClone(plan);
}

export function validateTaskGraph(tasks: Task[]): void {
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (byId.size !== tasks.length) throw new Error('Duplicate task IDs.');
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('Task dependencies contain a cycle.');
    if (visited.has(id)) return;
    const task = byId.get(id);
    if (!task) throw new Error('Dependency task was not found.');
    visiting.add(id);
    for (const blocker of task.blockedBy ?? []) visit(blocker);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
}

/**
 * TaskManager - Manages the session-based task list and planning mode.
 * This is an in-memory state for the current CLI session, aligning with Claude Code's Plan Mode.
 */
export class TaskManager {
  private static tasks: Task[] = [];
  private static mode: WorkMode = 'auto';
  private static subscribers: ((event: { type: 'plan_sync' | 'task_progress', data: any }) => void)[] = [];

  static subscribe(cb: (event: { type: 'plan_sync' | 'task_progress', data: any }) => void) {
    this.subscribers.push(cb);
  }

  private static notify(type: 'plan_sync' | 'task_progress', data: any) {
    for (const cb of this.subscribers) cb({ type, data });
  }

  static startPlan(subjects: string[]) {
    this.mode = 'plan';
    this.tasks = subjects.map((subject, index) => ({
      id: (index + 1).toString(),
      subject,
      status: 'todo',
    }));
    this.notify('plan_sync', { mode: this.mode, tasks: this.tasks });
  }

  static updateTask(id: string, status: Task['status']) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.status = status;
      this.notify('task_progress', { taskId: id, status });
      return true;
    }
    return false;
  }

  static addTask(subject: string) {
    const nextId = (this.tasks.length + 1).toString();
    const newTask: Task = { id: nextId, subject, status: 'todo' };
    this.tasks.push(newTask);
    this.notify('plan_sync', { mode: this.mode, tasks: this.tasks });
    return newTask;
  }

  static getTasks(): Task[] {
    return this.tasks;
  }

  static getMode(): WorkMode {
    return this.mode;
  }

  static setMode(mode: WorkMode) {
    this.mode = mode;
    this.notify('plan_sync', { mode: this.mode, tasks: this.tasks });
  }

  static clear() {
    this.tasks = [];
    this.mode = 'auto';
    this.notify('plan_sync', { mode: this.mode, tasks: this.tasks });
  }
}
