import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { createNotebookRpc } from './notebook-rpc.js';

function workspaceSnapshot(primaryPath: string, additionalPath: string, hostId: string) {
  const primaryRootId = '00000000-0000-4000-8000-000000000003';
  return {
    schemaVersion: 1 as const,
    workspaceId: '00000000-0000-4000-8000-000000000001',
    workspaceRevision: 1,
    name: 'Session Workspace',
    hostId,
    platform: process.platform as 'darwin' | 'win32' | 'linux',
    roots: [
      { id: primaryRootId, label: 'Primary', path: primaryPath, role: 'primary' as const, access: 'read_write' as const },
      { id: '00000000-0000-4000-8000-000000000004', label: 'Additional', path: additionalPath, role: 'additional' as const, access: 'read_only' as const },
    ],
    cwd: { rootId: primaryRootId, relativePath: '.' },
    worktree: { enabled: false },
  };
}

it('isolates remote notebook snapshots by session and honors local denial rules', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ocean-notebook-rpc-'));
  try {
    const file = path.join(workspace, 'note.ipynb');
    await writeFile(file, JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: [{ id: 'a', cell_type: 'markdown', metadata: {}, source: 'before' }] }));
    const rpc = createNotebookRpc(workspace);
    await expect(rpc('notebook_read', { path: 'note.ipynb' }, 'alice')).rejects.toThrow('requires a session');
    await rpc('notebook_read', { path: 'note.ipynb', sessionId: 'session-a' }, 'alice');
    await expect(rpc('notebook_edit', { path: 'note.ipynb', sessionId: 'session-b', cell_id: 'a', new_source: 'forbidden' }, 'alice')).rejects.toThrow('current session');
    await rpc('notebook_edit', { path: 'note.ipynb', sessionId: 'session-a', cell_id: 'a', new_source: 'after' }, 'alice');
    expect(JSON.parse(await readFile(file, 'utf8')).cells[0].source).toBe('after');
    await mkdir(path.join(workspace, '.ocean'), { recursive: true });
    await writeFile(path.join(workspace, '.ocean', 'settings.local.json'), JSON.stringify({ deny: ['NotebookEdit(note.ipynb)'] }));
    const deniedRpc = createNotebookRpc(workspace);
    await deniedRpc('notebook_read', { path: 'note.ipynb', sessionId: 'session-a' }, 'alice');
    await expect(deniedRpc('notebook_edit', { path: 'note.ipynb', sessionId: 'session-a', cell_id: 'a', new_source: 'blocked' }, 'alice')).rejects.toThrow('Local permission policy denied');
    expect(JSON.parse(await readFile(file, 'utf8')).cells[0].source).toBe('after');
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

it('binds Host file operations to the Session snapshot roots and per-root access', async () => {
  const primary = await mkdtemp(path.join(os.tmpdir(), 'ocean-host-primary-'));
  const additional = path.join(primary, 'readonly');
  const outside = await mkdtemp(path.join(os.tmpdir(), 'ocean-host-outside-'));
  const hostId = '00000000-0000-4000-8000-000000000002';
  const snapshot = workspaceSnapshot(primary, additional, hostId);
  try {
    await mkdir(additional);
    await writeFile(path.join(primary, 'inside.txt'), 'primary');
    await writeFile(path.join(additional, 'inside.txt'), 'additional');
    await writeFile(path.join(outside, 'outside.txt'), 'outside');
    const rpc = createNotebookRpc(undefined, hostId);

    await expect(rpc('file_read', {
      path: 'inside.txt',
      sessionId: 'session-a',
      workspaceSnapshot: snapshot,
    }, 'alice')).resolves.toMatchObject({ content: 'primary' });
    await expect(rpc('file_read', {
      path: path.join(additional, 'inside.txt'),
      sessionId: 'session-a',
      workspaceSnapshot: snapshot,
    }, 'alice')).resolves.toMatchObject({ content: 'additional' });
    await expect(rpc('file_read', {
      path: path.join(outside, 'outside.txt'),
      sessionId: 'session-a',
      workspaceSnapshot: snapshot,
    }, 'alice')).rejects.toThrow('outside the Session Workspace roots');
    await expect(rpc('file_write', {
      path: path.join(additional, 'new.txt'),
      content: 'blocked',
      sessionId: 'session-a',
      workspaceSnapshot: snapshot,
    }, 'alice')).rejects.toThrow('read-only');
    await expect(rpc('file_read', {
      path: 'inside.txt',
      sessionId: 'session-a',
      workspaceSnapshot: { ...snapshot, hostId: '00000000-0000-4000-8000-000000000005' },
    }, 'alice')).rejects.toThrow('different Host');
  } finally {
    await Promise.all([
      rm(primary, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
});

it('refuses Device RPC file access when the CLI has no authenticated Host identity', async () => {
  const rpc = createNotebookRpc();
  await expect(rpc('file_read', {
    path: 'source.txt',
    sessionId: 'session-a',
  }, 'alice')).rejects.toThrow('authenticated Workspace Host');
});

it('reads local files through the same session-scoped device handler and enforces local permissions', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ocean-file-rpc-'));
  try {
    await writeFile(path.join(workspace, 'source.txt'), 'first\nsecond\nthird\n');
    await writeFile(path.join(workspace, '.env'), 'SECRET=value');
    const rpc = createNotebookRpc(workspace);
    const result = await rpc('file_read', { path: 'source.txt', offset: 1, limit: 1, sessionId: 's' }, 'alice');
    expect(result).toMatchObject({ content: 'second', offset: 1 });
    await expect(rpc('file_read', { path: 'source.txt', limit: 1001, sessionId: 's' }, 'alice')).rejects.toThrow('Invalid file read');
    await expect(rpc('file_read', { path: '.env', sessionId: 's' }, 'alice')).rejects.toThrow();
    await expect(rpc('file_read', { path: '../outside', sessionId: 's' }, 'alice')).rejects.toThrow();
    await mkdir(path.join(workspace, '.ocean'), { recursive: true });
    await writeFile(path.join(workspace, '.ocean', 'settings.local.json'), JSON.stringify({ deny: ['Read(source.txt)'] }));
    const denied = createNotebookRpc(workspace);
    await expect(denied('file_read', { path: 'source.txt', sessionId: 's' }, 'alice')).rejects.toThrow('Local permission policy denied');
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

it('uses the local write, exact edit and atomic patch implementations for device calls', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ocean-file-write-rpc-'));
  try {
    const rpc = createNotebookRpc(workspace);
    const sessionId = 's';
    await rpc('file_write', { path: 'a.txt', content: 'one\ntwo\n', sessionId }, 'alice');
    await rpc('file_edit', { path: 'a.txt', old_string: 'one', new_string: 'first', sessionId }, 'alice');
    await rpc('file_patch', { path: 'a.txt', edits: [{ old_string: 'first', new_string: '1' }, { old_string: 'two', new_string: '2' }], sessionId }, 'alice');
    expect(await readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe('1\n2\n');
    await expect(rpc('file_patch', { path: 'a.txt', edits: [{ old_string: 'missing', new_string: 'x' }], sessionId }, 'alice')).rejects.toThrow();
    expect(await readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe('1\n2\n');
    await mkdir(path.join(workspace, '.ocean'), { recursive: true });
    await writeFile(path.join(workspace, '.ocean', 'settings.local.json'), JSON.stringify({ deny: ['Edit(a.txt)'] }));
    const denied = createNotebookRpc(workspace);
    await expect(denied('file_edit', { path: 'a.txt', old_string: '1', new_string: 'x', sessionId }, 'alice')).rejects.toThrow('Local permission policy denied');
    expect(await readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe('1\n2\n');
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
