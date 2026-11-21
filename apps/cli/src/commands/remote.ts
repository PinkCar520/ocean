import type { Command } from 'commander';
import { workspaceRecordSchema, workspaceSnapshotSchema, type WorkspaceSnapshot } from '@ocean/contracts';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, stat } from 'node:fs/promises';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { hostname, homedir } from 'node:os';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { resolveApiKey } from '../utils/auth.js';
import { atomicWriteFile } from '../utils/file-system.js';
import { startWorkspaceHost } from '../workspace-host-connection.js';

const hostFile = join(homedir(), '.ocean', 'remote-host.json');
const hostSchema = z.object({
  gateway: z.string().url(),
  hostId: z.string().uuid(),
  credential: z.string().min(32),
  roots: z.record(z.string(), z.enum(['read_only', 'read_write'])).default({}),
}).strict();

type PairedHost = z.infer<typeof hostSchema>;

export function oceanGatewayUrl() {
  return (process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function gatewayRequest(path: string, method = 'GET', body?: object) {
  const apiKey = await resolveApiKey();
  if (!apiKey) throw new Error('Ocean Remote requires authentication. Run ocean login first.');
  const response = await fetch(`${oceanGatewayUrl()}/api/${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Ocean Remote request failed: HTTP ${response.status}`);
  const result = await response.json() as { success?: boolean; data?: unknown };
  if (result.success !== true) throw new Error('Gateway rejected the Remote request.');
  return result.data;
}

function readHost(): PairedHost {
  const stat = lstatSync(hostFile);
  if (!stat.isFile() || (process.platform !== 'win32' && stat.mode & 0o077) || stat.size > 128 * 1024) {
    throw new Error('Unsafe Ocean Remote host credentials.');
  }
  return hostSchema.parse(JSON.parse(readFileSync(hostFile, 'utf8')));
}

async function saveHost(host: PairedHost) {
  const directory = join(homedir(), '.ocean');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Unsafe Ocean configuration directory.');
  await atomicWriteFile(hostFile, `${JSON.stringify(host, null, 2)}\n`, { defaultMode: 0o600 });
}

export async function remoteWorkspaceSnapshot(id: string): Promise<WorkspaceSnapshot> {
  const list = z.array(workspaceRecordSchema).parse(await gatewayRequest('workspaces'));
  const workspace = list.find((row) => row.id === id);
  if (!workspace) throw new Error('Unknown Ocean Remote workspace.');
  const { id: workspaceId, revision: workspaceRevision, status, ...configuration } = workspace;
  return workspaceSnapshotSchema.parse({ ...configuration, schemaVersion: 1, workspaceId, workspaceRevision });
}

export function registerRemoteCommands(program: Command): void {
  const remote = program.command('remote').description('Pair and serve an Ocean workspace host');

  remote.command('pair').option('--name <name>', 'Display name for the host').action(async (options: { name?: string }) => {
    let previous: PairedHost | undefined;
    try { previous = readHost(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const gateway = oceanGatewayUrl();
    const hostId = previous?.gateway === gateway ? previous.hostId : randomUUID();
    const result = await gatewayRequest('workspace-hosts/register', 'POST', {
      hostId, name: options.name ?? hostname(), platform: process.platform,
    });
    const registered = z.object({ hostId: z.string().uuid(), credential: z.string().min(32) }).parse(result);
    if (registered.hostId !== hostId) throw new Error('Gateway returned a different host identity.');
    await saveHost({ gateway, ...registered, roots: previous?.gateway === gateway ? previous.roots : {} });
    process.stdout.write(`${hostId}\n`);
  });

  remote.command('add-workspace').argument('<directory>')
    .option('--name <name>', 'Workspace name')
    .option('--read-only', 'Expose this workspace without write access')
    .action(async (directory: string, options: { name?: string; readOnly?: boolean }) => {
      const host = readHost();
      if (host.gateway !== oceanGatewayUrl()) throw new Error('Remote host is paired to a different Gateway.');
      const path = await realpath(directory);
      if (!(await stat(path)).isDirectory()) throw new Error('Workspace root must be a directory.');
      const access = options.readOnly ? 'read_only' : 'read_write';
      const rootId = randomUUID();
      await saveHost({ ...host, roots: { ...host.roots, [path]: access } });
      const workspace = workspaceRecordSchema.parse(await gatewayRequest('workspaces', 'POST', {
        name: options.name ?? (basename(path) || 'Workspace'),
        hostId: host.hostId,
        platform: process.platform,
        roots: [{ id: rootId, label: options.name ?? (basename(path) || 'Workspace'), path, role: 'primary', access }],
        cwd: { rootId, relativePath: '' },
        worktree: { enabled: false },
      }));
      process.stdout.write(`${workspace.id}\n`);
    });

  remote.command('list-workspaces').action(async () => {
    const records = z.array(workspaceRecordSchema).parse(await gatewayRequest('workspaces'));
    process.stdout.write(`${JSON.stringify(records)}\n`);
  });

  remote.command('serve').action(async () => {
    const host = readHost();
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        stop();
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
        if (error) reject(error);
        else resolve();
      };
      const interrupt = () => finish();
      const stop = startWorkspaceHost(host, (status) => {
        if (status === 'unauthorized' || status === 'disconnected') finish(new Error(`Remote host ${status}.`));
        else process.stderr.write(`[Ocean Remote] ${status}\n`);
      }, (params) => {
        const snapshot = workspaceSnapshotSchema.parse((params as { workspaceSnapshot?: unknown } | null)?.workspaceSnapshot);
        const current = readHost();
        if (current.hostId !== host.hostId || current.credential !== host.credential) {
          throw new Error('Remote host credentials changed. Restart the host.');
        }
        for (const root of snapshot.roots) {
          const actual = realpathSync(root.path);
          if (actual !== root.path || !Object.hasOwn(current.roots, actual)
            || (root.access === 'read_write' && current.roots[actual] !== 'read_write')) {
            throw new Error('Remote workspace root is not authorized on this host.');
          }
        }
      });
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
    });
  });
}
