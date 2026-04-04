import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { RPCResponse } from '@uclaw/core';

@WebSocketGateway({ cors: { origin: '*' } })
export class RpcGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // 记录在线的 CLI 客户端映射 (工号 -> SocketId)
  private clients = new Map<string, string>();

  // 记录等待中的请求 (requestId -> { resolve, reject, timeout })
  private pendingRequests = new Map<string, { 
    resolve: (val: any) => void; 
    reject: (err: any) => void;
    timeout: NodeJS.Timeout;
  }>();

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.clients.set(userId, client.id);
      console.log(`[RpcGateway] CLI connected: ${userId} (${client.id})`);
    } else {
      console.warn(`[RpcGateway] Connection attempt without userId. Disconnecting.`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.clients.entries()) {
      if (socketId === client.id) {
        this.clients.delete(userId);
        console.log(`[RpcGateway] CLI disconnected: ${userId}`);
        break;
      }
    }
  }

  @SubscribeMessage('rpc_response')
  handleRpcResponse(client: Socket, payload: RPCResponse) {
    const request = this.pendingRequests.get(payload.id);
    if (request) {
      clearTimeout(request.timeout);
      if (payload.error) {
        request.reject(new Error(payload.error));
      } else {
        request.resolve(payload.result);
      }
      this.pendingRequests.delete(payload.id);
      console.log(`[RpcGateway] Resolved RPC Response (ID: ${payload.id})`);
    }
  }

  // 下发指令到特定用户的 CLI 并等待返回结果
  async sendToCli(userId: string, method: string, params: any): Promise<any> {
    const socketId = this.clients.get(userId);
    if (!socketId) {
      throw new Error(`CLI for user ${userId} not online.`);
    }

    const id = Math.random().toString(36).substring(7);
    
    return new Promise((resolve, reject) => {
      // 设置 15 秒超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC Request Timeout: ${method} (ID: ${id})`));
      }, 15000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.server.to(socketId).emit('rpc_request', { id, method, params });
      console.log(`[RpcGateway] Command sent to ${userId}: ${method} (ID: ${id}), waiting for response...`);
    });
  }

  getOnlineUsers(): string[] {
    return Array.from(this.clients.keys());
  }
}
