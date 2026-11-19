// Dedicated Electron utility-process entry point. The legacy daemon has a broader RPC surface.
import { io } from 'socket.io-client';
import { createNotebookRpc } from './tools/notebook-rpc.js';

interface HostConfig {
  gateway: string;
  hostId: string;
  credential: string;
}
const parent = (process as NodeJS.Process & {
  parentPort?: {
    once(event: 'message', callback: (event: { data: HostConfig }) => void): void;
    postMessage(status: string): void;
  };
}).parentPort;
if (!parent) throw new Error('Workspace Host requires a Desktop supervisor.');

parent.once('message', ({ data: { gateway, hostId, credential } }) => {
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
    identityTimeout = setTimeout(() => process.exit(1), 10_000);
  });
  socket.on('rpc_identity', (identity) => {
    if (identity?.hostId !== hostId || typeof identity.workId !== 'string') return;
    clearTimeout(identityTimeout);
    workId = identity.workId;
    parent.postMessage('online');
  });
  socket.on('rpc_auth_error', () => {
    workId = undefined;
    socket.disconnect();
    parent.postMessage('unauthorized');
  });
  socket.on('disconnect', (reason) => {
    clearTimeout(identityTimeout);
    workId = undefined;
    parent.postMessage('reconnecting');
    if (reason === 'io server disconnect') process.exit(1);
  });
  socket.on('connect_error', () => parent.postMessage('reconnecting'));

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
      case 'file_patch':
        try {
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
});
