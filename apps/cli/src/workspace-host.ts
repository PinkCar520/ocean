import { startWorkspaceHost, type HostConfig } from './workspace-host-connection.js';

const parent = (process as NodeJS.Process & {
  parentPort?: {
    once(event: 'message', callback: (event: { data: HostConfig }) => void): void;
    postMessage(status: string): void;
  };
}).parentPort;
if (!parent) throw new Error('Workspace Host requires a Desktop supervisor.');

parent.once('message', ({ data }) => {
  startWorkspaceHost(data, (status) => {
    parent.postMessage(status);
    if (status === 'disconnected') process.exit(1);
  });
});
