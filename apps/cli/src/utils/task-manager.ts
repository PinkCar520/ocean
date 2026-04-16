export interface Task {
  id: string;
  subject: string;
  status: 'todo' | 'doing' | 'done' | 'failed';
}

export type WorkMode = 'auto' | 'plan';

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
