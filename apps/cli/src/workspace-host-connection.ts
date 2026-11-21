// Dedicated Electron utility-process entry point. The legacy daemon has a broader RPC surface.
import { io } from 'socket.io-client';
import { createNotebookRpc } from './tools/notebook-rpc.js';

export interface HostConfig {
  gateway: string;
  hostId: string;
  credential: string;
}
export function startWorkspaceHost({ gateway, hostId, credential }: HostConfig, notify: (status: string) => void, authorize?: (params: unknown) => void) {
  const run = createNotebookRpc(undefined, hostId);
  const socket = io(gateway, {
    query: { clientType: 'cli' },
    auth: { hostId, hostCredential: credential },
    transports: ['websocket'],
    autoConnect: false,
    reconnectionDelayMax: 15_000,
  });
  let workId: string | undefined;
  let identityTimeout: ReturnType<typeof setTimeout> | undefined;
  socket.on('connect', () => {
    identityTimeout = setTimeout(() => { notify('unauthorized'); socket.disconnect(); }, 10_000);
  });
  socket.on('rpc_identity', (identity) => {
    if (identity?.hostId !== hostId || typeof identity.workId !== 'string') return;
    clearTimeout(identityTimeout);
    workId = identity.workId;
    notify('online');
  });
  socket.on('rpc_auth_error', () => {
    workId = undefined;
    socket.disconnect();
    notify('unauthorized');
  });
  socket.on('disconnect', (reason) => {
    clearTimeout(identityTimeout);
    workId = undefined;
    notify('reconnecting');
    if (reason === 'io server disconnect') notify('disconnected');
  });
  socket.on('connect_error', () => notify('reconnecting'));

  socket.on('rpc_request', async ({ id, method, params }) => {
    const principal = workId;
    const connection = socket.id;
    if (!principal || typeof id !== 'string') return;
    const respond = (body: object) => {
      if (socket.connected && socket.id === connection) socket.emit('rpc_response', { id, ...body });
    };
    switch (method) {
      case 'notebook_read':
      case 'notebook_edit':
      case 'file_read':
      case 'file_write':
      case 'file_edit':
      case 'lsp':
      case 'file_patch':
        try {
          authorize?.(params);
          respond({ result: await run(method, params ?? {}, principal, id) });
        } catch (error) {
          respond({ error: error instanceof Error ? error.message : 'Workspace operation failed.' });
        }
        break;
      default:
        respond({ error: 'Method is unavailable on Desktop Workspace Host.' });
    }
  });
  socket.connect();
  return () => {
    clearTimeout(identityTimeout);
    socket.removeAllListeners();
    socket.disconnect();
  };
}
