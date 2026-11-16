import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { createNotebookRpc } from './notebook-rpc.js';

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
