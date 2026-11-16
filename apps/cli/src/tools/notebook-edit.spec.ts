import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyApprovalGate } from '../llm/chat.js';
import { toAgentToolSet } from './index.js';

describe('notebook_edit', () => {
  let root = '';
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ''; });

  async function workspace() {
    root = await mkdtemp(path.join(os.tmpdir(), 'ocean-notebook-'));
    const dir = path.join(root, 'workspace');
    await mkdir(dir);
    const file = path.join(dir, 'analysis.ipynb');
    const notebook = { nbformat: 4, nbformat_minor: 5, metadata: { language_info: { name: 'python' } }, cells: [
      { id: 'first', cell_type: 'code', metadata: { tag: 'keep' }, source: ['print(1)'], execution_count: 1, outputs: [{ output_type: 'stream', text: '1' }] },
      { id: 'second', cell_type: 'markdown', metadata: {}, source: 'notes' },
    ] };
    await writeFile(file, JSON.stringify(notebook, null, 1) + '\n');
    return { dir, file };
  }

  it('requires a session read and preserves notebook structure through replace, insert and delete', async () => {
    const { dir, file } = await workspace();
    let sessionId = 'one';
    const tools = await toAgentToolSet({ cwd: dir, userId: 'tester', sessionId, getSessionId: () => sessionId });
    const edit = (args: any) => tools.notebook_edit.execute(args, {});
    const replacement = { path: 'analysis.ipynb', cell_id: 'first', new_source: 'print(2)' };
    expect(tools.notebook_edit.requiresApproval(replacement)).toBe(true);
    expect((await edit(replacement)).error).toContain('Read this notebook');
    await tools.file_read.execute({ path: 'analysis.ipynb' }, {});
    sessionId = 'two';
    expect((await edit(replacement)).error).toContain('current session');
    sessionId = 'one';
    const denied = await applyApprovalGate(tools).notebook_edit.execute(replacement, {});
    expect(denied.text).toContain('审批不可用');
    const approved = applyApprovalGate(tools, async () => 'approved');
    expect((await approved.notebook_edit.execute(replacement, {})).error).toBeUndefined();
    let notebook = JSON.parse(await readFile(file, 'utf8'));
    expect(notebook.cells[0]).toMatchObject({ id: 'first', source: 'print(2)', metadata: { tag: 'keep' }, execution_count: null, outputs: [] });
    const inserted = await edit({ path: 'analysis.ipynb', mode: 'insert', cell_id: 'first', cell_type: 'code', new_source: 'x = 1' });
    expect(inserted.data.cell_id).toMatch(/^[a-f0-9]{16}$/);
    notebook = JSON.parse(await readFile(file, 'utf8'));
    expect(notebook.cells.map((cell: any) => cell.id)).toEqual(['first', inserted.data.cell_id, 'second']);
    expect((await edit({ path: 'analysis.ipynb', mode: 'delete', cell_id: inserted.data.cell_id })).error).toBeUndefined();
    expect(JSON.parse(await readFile(file, 'utf8')).cells).toHaveLength(2);
  });

  it('rejects stale reads, ambiguous IDs, policy denies and cancelled operations', async () => {
    const { dir, file } = await workspace();
    const tools = await toAgentToolSet({ cwd: dir, userId: 'tester', sessionId: 'one' });
    await tools.file_read.execute({ path: 'analysis.ipynb' }, {});
    const notebook = JSON.parse(await readFile(file, 'utf8'));
    notebook.cells[1].id = 'first';
    await writeFile(file, JSON.stringify(notebook));
    const input = { path: 'analysis.ipynb', cell_id: 'first', new_source: 'edited' };
    expect((await tools.notebook_edit.execute(input, {})).error).toContain('changed since it was read');
    await tools.file_read.execute({ path: 'analysis.ipynb' }, {});
    expect((await tools.notebook_edit.execute(input, {})).error).toContain('ambiguous');
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    expect((await tools.notebook_edit.execute(input, { abortSignal: controller.signal })).error).toBe('cancelled');
    await tools.task_plan.execute({ action: 'start', subjects: ['Review notebook'] }, {});
    expect((await tools.notebook_edit.execute(input, {})).error).toContain('Plan mode is active');
    await mkdir(path.join(dir, '.ocean'));
    await writeFile(path.join(dir, '.ocean', 'settings.local.json'), JSON.stringify({ deny: ['Edit(analysis.ipynb)'] }));
    const deniedTools = await toAgentToolSet({ cwd: dir, userId: 'tester', sessionId: 'one' });
    expect((await deniedTools.notebook_edit.execute(input, {})).error).toContain('Permission policy denied');
  });

  it('supports legacy index IDs and valid cell type conversion', async () => {
    const { dir, file } = await workspace();
    const notebook = JSON.parse(await readFile(file, 'utf8'));
    notebook.nbformat_minor = 4;
    delete notebook.cells[0].id;
    await writeFile(file, JSON.stringify(notebook));
    const tools = await toAgentToolSet({ cwd: dir, userId: 'tester', sessionId: 'one' });
    await tools.file_read.execute({ path: 'analysis.ipynb' }, {});
    const result = await tools.notebook_edit.execute({ path: 'analysis.ipynb', cell_id: 'cell-0', cell_type: 'markdown', new_source: 'converted' }, {});
    expect(result.error).toBeUndefined();
    const cell = JSON.parse(await readFile(file, 'utf8')).cells[0];
    expect(cell).toMatchObject({ cell_type: 'markdown', source: 'converted' });
    expect(cell).not.toHaveProperty('outputs');
    expect(cell).not.toHaveProperty('execution_count');
    const inserted = await tools.notebook_edit.execute({ path: 'analysis.ipynb', mode: 'insert', cell_type: 'code', new_source: 'a = 1' }, {});
    expect(inserted.data.cell_id).toBe('cell-0');
  });
});
