import { LocalTool, LocalToolResponse } from '../base.js';
import { TaskManager, Task } from '../../utils/task-manager.js';

interface PlanParams {
  action: 'start' | 'update' | 'list' | 'exit';
  subjects?: string[];
  id?: string;
  status?: Task['status'];
}

/**
 * PlanTool - Provides session-based task and planning management, aligned with Claude Code.
 */
export class PlanTool extends LocalTool<PlanParams, any> {
  readonly name = 'local_plan';
  readonly description = 'Manage task execution plans. Action "start" requires "subjects" (array of steps). Action "update" requires "id" and "status".';

  async execute(params: PlanParams): Promise<LocalToolResponse<any>> {
    const { action, subjects, id, status } = params;

    switch (action) {
      case 'start':
        if (!subjects || subjects.length === 0) {
          return { success: false, error: 'Subjects are required for starting a plan.' };
        }
        TaskManager.startPlan(subjects);
        return {
          success: true,
          data: { tasks: TaskManager.getTasks(), mode: 'plan' },
          uiHint: 'tree' // Using tree for now to show structure
        };

      case 'update':
        if (!id || !status) {
          return { success: false, error: 'ID and Status are required for updating a task.' };
        }
        const updated = TaskManager.updateTask(id, status);
        if (!updated) {
          return { success: false, error: `Task #${id} not found.` };
        }
        return {
          success: true,
          data: { tasks: TaskManager.getTasks() },
          uiHint: 'tree'
        };

      case 'list':
        return {
          success: true,
          data: { tasks: TaskManager.getTasks(), mode: TaskManager.getMode() },
          uiHint: 'tree'
        };

      case 'exit':
        TaskManager.setMode('auto');
        TaskManager.clear();
        return {
          success: true,
          data: { message: 'Exited plan mode and cleared tasks.' }
        };

      default:
        return { success: false, error: `Invalid action: ${action}` };
    }
  }
}
