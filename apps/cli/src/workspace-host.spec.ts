import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';

const { socket, run } = vi.hoisted(() => ({
  socket: { on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), emit: vi.fn(), connected: true, id: 'connection' },
  run: vi.fn(),
}));
vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('./tools/notebook-rpc.js', () => ({ createNotebookRpc: () => run }));

afterEach(() => {
  Reflect.deleteProperty(process, 'parentPort');
});

test('requires authenticated Host identity and keeps legacy execution off the Desktop RPC surface', async () => {
  const parent = Object.assign(new EventEmitter(), { postMessage: vi.fn() });
  Object.defineProperty(process, 'parentPort', { value: parent, configurable: true });
  await import('./workspace-host.js');
  parent.emit('message', { data: { gateway: 'http://localhost:3000', hostId: 'desktop', credential: 'test' } });
  const handler = (event: string) => socket.on.mock.calls.find(([name]) => name === event)?.[1];
  const request = handler('rpc_request');
  const params = { sessionId: 'session', path: 'note.ipynb' };

  await request({ id: 'before-auth', method: 'notebook_read', params });
  handler('rpc_identity')({ hostId: 'other', workId: 'alice' });
  await request({ id: 'wrong-host', method: 'notebook_read', params });
  expect(run).not.toHaveBeenCalled();

  handler('rpc_identity')({ hostId: 'desktop', workId: 'alice' });
  expect(parent.postMessage).toHaveBeenCalledWith('online');
  for (const method of ['bash', 'powershell', 'local_file_edit', 'ls', 'create_local_project']) {
    await request({ id: method, method, params });
    expect(socket.emit).toHaveBeenLastCalledWith('rpc_response', {
      id: method, error: 'Method is unavailable on Desktop Workspace Host.',
    });
  }
  expect(run).not.toHaveBeenCalled();
  await request({ id: 'read', method: 'notebook_read', params });
  expect(run).toHaveBeenCalledWith('notebook_read', params, 'alice', 'read');

  handler('disconnect')('transport close');
  expect(parent.postMessage).toHaveBeenLastCalledWith('reconnecting');
  await request({ id: 'after-disconnect', method: 'file_read', params });
  expect(run).toHaveBeenCalledTimes(1);
});
