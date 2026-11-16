import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types.js';
import { Checkpoints } from '../utils/checkpoints.js';
import { notebookDigest, NotebookSnapshots } from '../utils/notebook-snapshots.js';
import { SecurityEngine } from '../utils/security.js';

const MAX_BYTES = 2 * 1024 * 1024;
const inputSchema = z.object({
  path: z.string().min(1).describe('Path to a previously read workspace .ipynb notebook'),
  mode: z.enum(['replace', 'insert', 'delete']).default('replace'),
  cell_id: z.string().min(1).optional().describe('Cell ID or cell-N index; insertion is after this cell, or at the beginning when omitted'),
  cell_type: z.enum(['code', 'markdown']).optional(),
  new_source: z.string().max(MAX_BYTES).optional(),
}).strict();

async function readBounded(pathname: string, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  const handle = await fs.open(pathname, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Path is not a regular file.');
    if (stat.size > MAX_BYTES) throw new Error('Notebook exceeds the 2 MB editing limit.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > MAX_BYTES) throw new Error('Notebook exceeds the 2 MB editing limit.');
    return buffer.subarray(0, used);
  } finally { await handle.close(); }
}

export function createNotebookEditTool(snapshots: NotebookSnapshots) {
  return {
    name: 'notebook_edit',
    description: 'Replace, insert, or delete a Jupyter notebook cell. Read the notebook first. Insert without cell_id prepends; changing code clears its execution outputs.',
    requiresApproval: true,
    inputSchema,
    async execute(rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
      try {
        const input = inputSchema.parse(rawInput);
        if (path.extname(input.path).toLowerCase() !== '.ipynb') throw new Error('Notebook path must end in .ipynb.');
        if (input.mode !== 'insert' && !input.cell_id) throw new Error('cell_id is required for replace and delete.');
        if (input.mode !== 'delete' && input.new_source === undefined) throw new Error('new_source is required for replace and insert.');
        if (input.mode === 'insert' && !input.cell_type) throw new Error('cell_type is required for insert.');
        const security = new SecurityEngine(ctx.cwd);
        const filePath = await security.resolveReadablePath(input.path);
        return await snapshots.withLock(filePath, async () => {
          ctx.signal?.throwIfAborted();
          const expected = snapshots.get(ctx.sessionId, filePath);
          if (!expected) throw new Error('Read this notebook in the current session before editing it.');
          const original = await readBounded(filePath, ctx.signal);
          if (notebookDigest(original) !== expected) throw new Error('Notebook changed since it was read. Read it again before editing.');
          let raw: string;
          try { raw = new TextDecoder('utf-8', { fatal: true }).decode(original); }
          catch { throw new Error('Notebook is not valid UTF-8 text.'); }
          let notebook: any;
          try { notebook = JSON.parse(raw); } catch { throw new Error('Notebook is not valid JSON.'); }
          if (!notebook || !Array.isArray(notebook.cells)) throw new Error('Notebook must contain a cells array.');
          let index = -1;
          if (input.cell_id) {
            const matches = notebook.cells.flatMap((cell: any, i: number) => cell && cell.id === input.cell_id ? [i] : []);
            if (matches.length > 1) throw new Error(`Cell ID is ambiguous: ${input.cell_id}`);
            if (matches.length === 1) index = matches[0];
            else {
              const match = /^cell-(\d+)$/.exec(input.cell_id);
              if (match) index = Number(match[1]);
            }
            if (!Number.isSafeInteger(index) || index < 0 || index >= notebook.cells.length) throw new Error(`Cell not found: ${input.cell_id}`);
          }
          let cellId = input.cell_id;
          if (input.mode === 'delete') notebook.cells.splice(index, 1);
          else if (input.mode === 'insert') {
            const supportsIds = notebook.nbformat > 4 || (notebook.nbformat === 4 && notebook.nbformat_minor >= 5);
            const cell: any = { cell_type: input.cell_type, metadata: {}, source: input.new_source };
            if (supportsIds) { cellId = randomUUID().replace(/-/g, '').slice(0, 16); cell.id = cellId; }
            else cellId = `cell-${index + 1}`;
            if (input.cell_type === 'code') { cell.execution_count = null; cell.outputs = []; }
            notebook.cells.splice(index + 1, 0, cell);
          } else {
            const cell = notebook.cells[index];
            if (!cell || typeof cell !== 'object' || !['code', 'markdown', 'raw'].includes(cell.cell_type)) throw new Error('Invalid notebook cell.');
            const cellType = input.cell_type ?? cell.cell_type;
            cell.source = input.new_source;
            cell.cell_type = cellType;
            if (cellType === 'code') { cell.execution_count = null; cell.outputs = []; }
            else { delete cell.execution_count; delete cell.outputs; }
          }
          const newline = raw.includes('\r\n') ? '\r\n' : '\n';
          let updated = JSON.stringify(notebook, null, 1).replace(/\n/g, newline);
          if (raw.endsWith('\n')) updated += newline;
          if (Buffer.byteLength(updated) > MAX_BYTES) throw new Error('Edited notebook exceeds the 2 MB editing limit.');
          ctx.signal?.throwIfAborted();
          if (await security.resolveReadablePath(input.path) !== filePath) throw new Error('Notebook path changed during editing.');
          const checkpointId = await new Checkpoints(ctx).change([{ path: filePath, content: updated, expectedBefore: raw }]);
          snapshots.set(ctx.sessionId, filePath, notebookDigest(updated));
          return { data: { checkpointId, path: filePath, mode: input.mode, cell_id: cellId, cellCount: notebook.cells.length } };
        });
      } catch (error) { return { data: null, error: (error as Error).message }; }
    },
  };
}
