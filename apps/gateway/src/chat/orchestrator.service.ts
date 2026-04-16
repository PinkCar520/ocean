import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';

@Injectable()
export class OrchestratorService {
  private server!: Server;

  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  setServer(server: Server) {
    this.server = server;
  }

  /**
   * Sync the entire plan from the CLI to the database.
   * This is called when a plan starts or is majorly updated.
   */
  async syncPlan(sessionId: string, tasks: any[]) {
    console.log(`[Orchestrator] Syncing ${tasks.length} tasks for session ${sessionId}`);

    // Simple strategy: Clear existing tasks for the session and replace them
    // In a production environment, you might want a more sophisticated merge/patch approach
    await this.prisma.$transaction([
      this.prisma.task.deleteMany({ where: { sessionId } }),
      this.prisma.task.createMany({
        data: tasks.map((t, index) => ({
          sessionId,
          subject: t.subject,
          status: t.status || 'todo',
          order: index,
          metadata: t.metadata || {},
        })),
      }),
    ]);

    // Broadcast to Web UI
    this.server.to(sessionId).emit('workflow_plan_synced', { sessionId, tasks });
  }

  /**
   * Update the progress of a specific task.
   */
  async updateTaskProgress(sessionId: string, taskId: string, status: string, metadata?: any) {
    console.log(`[Orchestrator] Task ${taskId} updated to ${status} in session ${sessionId}`);

    // Update in DB (we might need to map the numerical CLI taskId to our UUID if we want perfect sync)
    // For now, we update by finding the task with the same order or subject if exact ID is hard
    // But since TaskManager IDs are simple strings like "1", "2", we'll try to find by order or subject
    const taskIndex = parseInt(taskId) - 1;
    
    const targetTask = await this.prisma.task.findFirst({
      where: { sessionId, order: taskIndex }
    });

    if (targetTask) {
      await this.prisma.task.update({
        where: { id: targetTask.id },
        data: { 
          status,
          metadata: metadata ? { ...(targetTask.metadata as any || {}), ...metadata } : targetTask.metadata as any,
          updatedAt: new Date()
        }
      });
    }

    // Broadcast to Web UI
    this.server.to(sessionId).emit('workflow_task_updated', { sessionId, taskId, status, metadata });
  }

  /**
   * Get all tasks for a session (used for UI initialization)
   */
  async getTasks(sessionId: string) {
    return this.prisma.task.findMany({
      where: { sessionId },
      orderBy: { order: 'asc' }
    });
  }
}
