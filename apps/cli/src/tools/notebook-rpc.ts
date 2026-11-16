import { executeTool } from './base.js';
import * as path from 'node:path';
import { createFileReadTool, createFileWriteTool, createFileEditTool, createFilePatchTool } from './core-tools.js';
import { createNotebookEditTool } from './notebook-edit.js';
import { NotebookSnapshots } from '../utils/notebook-snapshots.js';
import { PermissionPolicy } from '../utils/permission-policy.js';

/** Notebook state shared by RPC calls and scoped to the remote conversation. */
export function createNotebookRpc(workspace: string) {
  const snapshots = new NotebookSnapshots();
  const read = createFileReadTool(snapshots);
  const edit = createNotebookEditTool(snapshots);
  const write = createFileWriteTool();
  const fileEdit = createFileEditTool();
  const patch = createFilePatchTool();
  const policy = new PermissionPolicy(workspace);
  return async (method: 'notebook_read' | 'notebook_edit' | 'file_read' | 'file_write' | 'file_edit' | 'file_patch', params: Record<string, unknown>, userId: string, toolCallId?: string) => {
    if (typeof params.sessionId !== 'string' || !params.sessionId) throw new Error('Device RPC requires a session.');
    if (typeof params.path !== 'string') throw new Error('File path is required.');
    if ((method === 'notebook_read' || method === 'notebook_edit') && path.extname(params.path).toLowerCase() !== '.ipynb') throw new Error('Notebook path must end in .ipynb.');
    const { sessionId, ...input } = params;
    const isRead = method === 'file_read' || method === 'notebook_read';
    const action = policy.evaluate(isRead ? 'file_read' : method, input);
    if (action === 'deny' || (isRead && action !== 'allow')) throw new Error('Local permission policy denied this device operation.');
    const context = { cwd: workspace, userId, sessionId, toolCallId };
    const registry = { file_read: read, notebook_read: read, file_write: write, file_edit: fileEdit, file_patch: patch, notebook_edit: edit };
    const result = await executeTool(registry[method], input, context);
    if (result.errorCode === 'validation') throw new Error(`Invalid ${method.replace('_', ' ')}: ${result.error}`);
    if (result.error) throw new Error(result.error);
    return result.data;
  };
}
