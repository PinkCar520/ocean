import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { RPCResponse } from '@ocean/core';
import { ApiKeyService } from '../auth/api-key.service';
import { OCEAN_SESSION_COOKIE, readCookie } from '../auth/auth-cookie';
import { OrchestratorService } from './orchestrator.service';
import { WorkspaceHostService } from '../workspace/workspace-host.service';
import { workspaceSnapshotSchema } from '@ocean/contracts';

export class RemoteRpcError extends Error {}

@WebSocketGateway({ cors: { origin: '*' } })
export class RpcGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly orchestratorService: OrchestratorService,
    private readonly apiKeys: ApiKeyService,
    private readonly jwt: JwtService,
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly workspaceHosts: WorkspaceHostService,
  ) {}

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    this.orchestratorService.setServer(server);
  }

  // 记录在线的 CLI 客户端映射 (工号 -> SocketId)
  private clients = new Map<string, string>();
  private hosts = new Map<string, { socketId: string; userId: string; workId: string; platform: string; credentialHash: string }>();

  // 记录在线的 Web 客户端映射 (sessionId -> SocketId)
  private webClients = new Map<string, string>();

  // 记录等待中的请求 (requestId -> { resolve, reject, timeout })
  private pendingRequests = new Map<
    string,
    {
      resolve: (val: any) => void;
      reject: (err: any) => void;
      timeout: NodeJS.Timeout;
      socketId: string;
    }
  >();

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId;
    const sessionId = client.handshake.query.sessionId;
    const clientType = client.handshake.query.clientType;
    try {
      if (clientType === 'cli' && !userId && !sessionId) {
        const hostId = client.handshake.auth?.hostId;
        const credential = client.handshake.auth?.hostCredential;
        if (typeof hostId === 'string' && typeof credential === 'string') {
          const host = await this.workspaceHosts.authenticate(hostId, credential);
          if (!host || !client.connected) throw new Error('Workspace Host authentication failed');
          client.data.rpcPrincipal = { ...host, role: 'host' };
          this.hosts.set(host.hostId, {
            socketId: client.id,
            userId: host.userId,
            workId: host.workId,
            platform: host.platform,
            credentialHash: host.credentialHash,
          });
          client.emit('rpc_identity', { workId: host.workId, hostId: host.hostId });
          return;
        }
      }
      const principal = await this.authenticate(client);
      if (!client.connected) return;
      if (!sessionId && ((typeof userId === 'string' && userId) || (clientType === 'cli' && !userId))) {
        if (userId && userId !== principal.workId) throw new Error('Identity mismatch');
        client.data.rpcPrincipal = { ...principal, role: 'cli' };
        this.clients.set(principal.workId, client.id);
        client.emit('rpc_identity', { workId: principal.workId });
        return;
      }
      if (typeof sessionId === 'string' && sessionId && !userId) {
        const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId: principal.userId }, select: { id: true } });
        if (!session || !client.connected) throw new Error('Session access denied');
        client.data.rpcPrincipal = { ...principal, role: 'web', sessionId };
        this.webClients.set(sessionId, client.id);
        return;
      }
      throw new Error('Invalid connection identity');
    } catch {
      client.emit('rpc_auth_error', { message: 'Authentication or session authorization failed.' });
      client.disconnect(true);
    }
  }

  private async authenticate(client: Socket): Promise<{ userId: string; workId: string }> {
    const supplied = client.handshake.auth?.token;
    const header = client.handshake.headers.authorization;
    const token = (typeof supplied === 'string' && supplied) ||
      (typeof header === 'string' && header.replace(/^Bearer\s+/i, '')) ||
      readCookie(client.handshake.headers.cookie, OCEAN_SESSION_COOKIE) || '';
    if (token.startsWith('ocean_sk_')) {
      const user = await this.apiKeys.findUserByApiKey(token);
      if (user) return user;
      throw new Error('Invalid API key');
    }
    const payload = this.jwt.verify<{ sub?: unknown; workId?: unknown; jti?: string }>(token);
    if (typeof payload.sub !== 'string' || typeof payload.workId !== 'string') throw new Error('Invalid token');
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        workId: payload.workId,
        ...(payload.jti && { loginSessions: { some: { id: payload.jti, expiresAt: { gt: new Date() } } } }),
      },
      select: { id: true, workId: true },
    });
    if (!user) throw new Error('Unknown user');
    return { userId: user.id, workId: user.workId };
  }

  handleDisconnect(client: Socket) {
    for (const [id, request] of this.pendingRequests) {
      if (request.socketId !== client.id) continue;
      clearTimeout(request.timeout);
      this.pendingRequests.delete(id);
      request.reject(new Error('CLI disconnected before responding.'));
    }
    for (const [userId, socketId] of this.clients.entries()) {
      if (socketId === client.id) {
        this.clients.delete(userId);
        console.log(`[RpcGateway] CLI disconnected: ${userId}`);
        break;
      }
    }
    for (const [hostId, host] of this.hosts.entries()) {
      if (host.socketId === client.id) {
        this.hosts.delete(hostId);
        console.log(`[RpcGateway] Workspace Host disconnected: ${hostId}`);
        break;
      }
    }
    for (const [sessionId, socketId] of this.webClients.entries()) {
      if (socketId === client.id) {
        this.webClients.delete(sessionId);
        console.log(`[RpcGateway] Web disconnected: Session ${sessionId}`);
        break;
      }
    }
  }

  @SubscribeMessage('rpc_response')
  handleRpcResponse(client: Socket, payload: RPCResponse) {
    const request = this.pendingRequests.get(payload.id);
    if (request && request.socketId === client.id && ['cli', 'host'].includes(client.data.rpcPrincipal?.role)) {
      clearTimeout(request.timeout);
      if (payload.error) {
        request.reject(new RemoteRpcError(payload.error));
      } else {
        request.resolve(payload.result);
      }
      this.pendingRequests.delete(payload.id);
      console.log(`[RpcGateway] Resolved RPC Response (ID: ${payload.id}, outcome: ${payload.error ? 'error' : 'success'})`);
    }
  }

  @SubscribeMessage('plan_sync')
  async handlePlanSync(
    client: Socket,
    payload: { sessionId: string; mode: string; tasks: any[] },
  ) {
    if (!await this.mayUpdateSession(client, payload.sessionId)) return;
    console.log(
      `[RpcGateway] Plan Sync received from ${client.id} for session ${payload.sessionId}. Tasks: ${payload.tasks.length}`,
    );

    // Persist to DB and Broadcast to Web UI
    await this.orchestratorService.syncPlan(payload.sessionId, payload.tasks);
  }

  @SubscribeMessage('task_progress')
  async handleTaskProgress(
    client: Socket,
    payload: {
      sessionId: string;
      taskId: string;
      status: string;
      metadata?: any;
    },
  ) {
    if (!await this.mayUpdateSession(client, payload.sessionId)) return;
    console.log(
      `[RpcGateway] Task Progress: Task #${payload.taskId} is now ${payload.status}`,
    );

    // Update in DB and Broadcast to Web UI
    await this.orchestratorService.updateTaskProgress(
      payload.sessionId,
      payload.taskId,
      payload.status,
      payload.metadata,
    );
  }

  private async mayUpdateSession(client: Socket, sessionId: string): Promise<boolean> {
    const principal = client.data.rpcPrincipal;
    if (principal?.role !== 'cli' || this.clients.get(principal.workId) !== client.id || typeof sessionId !== 'string') return false;
    return !!await this.prisma.session.findFirst({ where: { id: sessionId, userId: principal.userId }, select: { id: true } });
  }

  // 下发指令到特定用户的 CLI 并等待返回结果
  async sendToCli(userId: string, method: string, params: any): Promise<any> {
    if (method === 'notebook_read' || method === 'notebook_edit') {
      if (typeof params?.sessionId !== 'string' || !params.sessionId) throw new Error('Notebook RPC requires a session.');
      const session = await this.prisma.session.findFirst({
        where: { id: params.sessionId, user: { workId: userId } }, select: { id: true },
      });
      if (!session) throw new Error('Notebook session access denied.');
    }
    const socketId = this.clients.get(userId);
    if (!socketId) {
      throw new Error(`CLI for user ${userId} not online.`);
    }

    const id = randomUUID();

    return new Promise((resolve, reject) => {
      // 设置 15 秒超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC Request Timeout: ${method} (ID: ${id})`));
      }, 15000);

      this.pendingRequests.set(id, { resolve, reject, timeout, socketId });

      this.server.to(socketId).emit('rpc_request', { id, method, params });
      console.log(
        `[RpcGateway] Command sent to ${userId}: ${method} (ID: ${id}), waiting for response...`,
      );
    });
  }

  async sendWorkspaceTool(
    workId: string,
    sessionId: string | undefined,
    method: 'file_read' | 'notebook_read' | 'notebook_edit',
    input: Record<string, unknown>,
  ): Promise<any> {
    if (sessionId) {
      const session = await this.prisma.session.findFirst({
        where: { id: sessionId, user: { workId } },
        select: { workspaceSnapshot: true },
      });
      if (!session) throw new RemoteRpcError('Workspace tool session access denied.');
      if (session.workspaceSnapshot != null) {
        const snapshot = workspaceSnapshotSchema.safeParse(session.workspaceSnapshot);
        if (!snapshot.success) throw new RemoteRpcError('Invalid Session workspace snapshot.');
        return this.sendToHost(snapshot.data.hostId, method, {
          ...input,
          sessionId,
          workspaceSnapshot: snapshot.data,
        });
      }
    }
    return this.sendToCli(workId, method === 'file_read' ? 'read_file' : method, {
      ...input,
      ...(method !== 'file_read' ? { sessionId } : {}),
    });
  }

  async sendToHost(hostId: string, method: string, params: any): Promise<any> {
    const host = this.hosts.get(hostId);
    if (!host || !(await this.workspaceHosts.isActive(hostId, host.credentialHash))) {
      throw new RemoteRpcError(`Workspace Host ${hostId} is not online or is no longer authorized.`);
    }
    const suppliedSnapshot = workspaceSnapshotSchema.safeParse(params?.workspaceSnapshot);
    if (!suppliedSnapshot.success || suppliedSnapshot.data.hostId !== hostId || suppliedSnapshot.data.platform !== host.platform) {
      throw new RemoteRpcError('Workspace Host does not match the Session snapshot.');
    }
    const sessionId = params?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new RemoteRpcError('Workspace Host RPC requires a session.');
    }
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: host.userId },
      select: { workspaceSnapshot: true },
    });
    const storedSnapshot = workspaceSnapshotSchema.safeParse(session?.workspaceSnapshot);
    if (!storedSnapshot.success || JSON.stringify(storedSnapshot.data) !== JSON.stringify(suppliedSnapshot.data)) {
      throw new RemoteRpcError('Workspace Host does not match the Session snapshot.');
    }

    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC Request Timeout: ${method} (ID: ${id})`));
      }, 15000);
      this.pendingRequests.set(id, { resolve, reject, timeout, socketId: host.socketId });
      this.server.to(host.socketId).emit('rpc_request', { id, method, params });
      console.log(`[RpcGateway] Workspace Host RPC sent: ${method} (ID: ${id}, session: ${sessionId}, host: ${hostId})`);
    });
  }

  // 向指定的 Web Session 客户端推送 AI 流数据块
  pushToWebClient(sessionId: string, eventName: string, payload: any) {
    const socketId = this.webClients.get(sessionId);
    if (socketId) {
      this.server.to(socketId).emit(eventName, payload);
    } else {
      console.warn(
        `[RpcGateway] pushToWebClient: No web client for session ${sessionId}. Event "${eventName}" dropped. Connected sessions: [${Array.from(this.webClients.keys()).join(', ')}]`,
      );
    }
  }

  getOnlineUsers(): string[] {
    return Array.from(this.clients.keys());
  }

  getOnlineHosts(): string[] {
    return Array.from(this.hosts.keys());
  }

  isUserOnline(userId: string): boolean {
    return this.clients.has(userId);
  }
}
