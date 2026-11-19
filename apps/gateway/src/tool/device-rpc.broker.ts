import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { workspaceSnapshotSchema, type WorkspaceSnapshot } from '@ocean/contracts';
import { TerminalToolError, type ToolContext } from './tool.types';

export const DEVICE_RPC_TOPIC = 'device.rpc';
type Method = 'notebook_read' | 'notebook_edit' | 'file_read' | 'file_write' | 'file_edit' | 'file_patch';
type Payload = { runId: string; toolCallId: string; userId: string; workId: string; sessionId: string; workspaceSnapshot: WorkspaceSnapshot; method: Method; input: Record<string, unknown>; expiresAt: string; result?: unknown };

/** Persist a device request so a Gateway process can deliver it to its connected CLI. */
@Injectable()
export class DeviceRpcBroker {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async request(method: Method, input: Record<string, unknown>, ctx?: ToolContext): Promise<unknown> {
    if (!ctx?.toolCallId) throw new TerminalToolError('Device operation requires a Run tool-call context.');
    const run = await this.prisma.agentRun.findUnique({
      where: { id: ctx.runId },
      select: { userId: true, spaceId: true, status: true, metadata: true, user: { select: { workId: true } } },
    });
    if (!run || run.userId !== ctx.userId) throw new TerminalToolError('Run ownership check failed.');
    if (run.status !== 'running') throw new TerminalToolError('Device operation requires a running Run.');
    const metadata = run.metadata as { sessionId?: unknown } | null;
    if (typeof metadata?.sessionId !== 'string' || !metadata.sessionId) throw new TerminalToolError('Device operation requires an owned conversation session.');
    const session = await this.prisma.session.findFirst({
      where: { id: metadata.sessionId, userId: ctx.userId, spaceId: run.spaceId },
      select: { id: true, workspaceSnapshot: true },
    });
    if (!session) throw new TerminalToolError('Device session ownership check failed.');
    const snapshot = workspaceSnapshotSchema.safeParse(session.workspaceSnapshot);
    if (!snapshot.success) throw new TerminalToolError('Device operation requires a valid Session Workspace snapshot.');
    const payload: Payload = { runId: ctx.runId, toolCallId: ctx.toolCallId, userId: ctx.userId, workId: run.user.workId, sessionId: session.id, workspaceSnapshot: snapshot.data, method, input: JSON.parse(JSON.stringify(input)), expiresAt: new Date(Date.now() + 25_000).toISOString() };
    const id = `device-${createHash('sha256').update(JSON.stringify([ctx.runId, ctx.toolCallId])).digest('hex')}`;
    const row = await this.prisma.outboxEvent.upsert({
      where: { id },
      create: { id, topic: DEVICE_RPC_TOPIC, aggregateType: 'AgentRun', aggregateId: ctx.runId, payload: payload as Prisma.InputJsonValue },
      update: {},
    });
    const prior = row.payload as unknown as Payload;
    // PostgreSQL jsonb may reorder object keys when returning the stored payload.
    if (row.topic !== DEVICE_RPC_TOPIC || prior.runId !== payload.runId || prior.toolCallId !== payload.toolCallId || prior.userId !== payload.userId || prior.workId !== payload.workId || prior.sessionId !== payload.sessionId || !isDeepStrictEqual(prior.workspaceSnapshot, payload.workspaceSnapshot) || prior.method !== payload.method || !isDeepStrictEqual(prior.input, payload.input)) {
      throw new TerminalToolError('Device request identity conflicts with an earlier call.');
    }
    const deadline = Date.parse(prior.expiresAt);
    if (!Number.isFinite(deadline)) throw new TerminalToolError('Device request has an invalid expiry.');
    for (;;) {
      const liveRun = await this.prisma.agentRun.findUnique({ where: { id: ctx.runId }, select: { status: true } });
      if (!liveRun || liveRun.status === 'cancelled') {
        await this.prisma.outboxEvent.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled', lastError: 'Run cancelled before dispatch.' } });
        await this.prisma.outboxEvent.updateMany({ where: { id, status: 'dispatched' }, data: { status: 'uncertain', lastError: 'Run cancelled after dispatch; device outcome is unknown.' } });
        throw new TerminalToolError('Run cancelled; device operation may have already started.');
      }
      const current = await this.prisma.outboxEvent.findUnique({ where: { id } });
      if (!current) throw new TerminalToolError('Device request disappeared.');
      const state = current.payload as unknown as Payload;
      if (current.status === 'processed') return state.result ?? null;
      if (current.status === 'failed' || current.status === 'uncertain' || current.status === 'cancelled') {
        throw new TerminalToolError(current.lastError ?? `Device request ${current.status}.`);
      }
      if (Date.now() >= deadline) {
        await this.prisma.outboxEvent.updateMany({ where: { id, status: 'pending' }, data: { status: 'failed', lastError: 'Device was not available before the request expired.' } });
        await this.prisma.outboxEvent.updateMany({ where: { id, status: 'dispatched' }, data: { status: 'uncertain', lastError: 'Device result is unknown; do not automatically repeat this operation.' } });
        continue;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}
