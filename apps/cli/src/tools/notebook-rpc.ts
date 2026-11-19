import { executeTool } from './base.js';
import * as path from 'node:path';
import { createFileReadTool, createFileWriteTool, createFileEditTool, createFilePatchTool } from './core-tools.js';
import { createNotebookEditTool } from './notebook-edit.js';
import { NotebookSnapshots } from '../utils/notebook-snapshots.js';
import { PermissionPolicy } from '../utils/permission-policy.js';
import { workspaceSnapshotSchema } from '@ocean/contracts';

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** Notebook state shared by RPC calls and scoped to the remote conversation. */
export function createNotebookRpc(workspace?: string, hostId?: string) {
  const snapshots = new NotebookSnapshots();
  const read = createFileReadTool(snapshots);
  const edit = createNotebookEditTool(snapshots);
  const write = createFileWriteTool();
  const fileEdit = createFileEditTool();
  const patch = createFilePatchTool();
  return async (method: 'notebook_read' | 'notebook_edit' | 'file_read' | 'file_write' | 'file_edit' | 'file_patch', params: Record<string, unknown>, userId: string, toolCallId?: string) => {
    if (typeof params.sessionId !== 'string' || !params.sessionId) throw new Error('Device RPC requires a session.');
    if (typeof params.path !== 'string') throw new Error('File path is required.');
    if ((method === 'notebook_read' || method === 'notebook_edit') && path.extname(params.path).toLowerCase() !== '.ipynb') throw new Error('Notebook path must end in .ipynb.');
    const { sessionId, ...input } = params;
    const isRead = method === 'file_read' || method === 'notebook_read';
    let activeWorkspace: string;
    if (hostId) {
      const parsed = workspaceSnapshotSchema.safeParse(params.workspaceSnapshot);
      if (!parsed.success) throw new Error('Device RPC requires a valid Session Workspace snapshot.');
      const snapshot = parsed.data;
      if (snapshot.hostId !== hostId) throw new Error('Session Workspace is assigned to a different Host.');
      if (snapshot.platform !== process.platform) throw new Error('Session Workspace platform does not match this Host.');
      const cwdRoot = snapshot.roots.find(root => root.id === snapshot.cwd.rootId);
      if (!cwdRoot) throw new Error('Session Workspace CWD root is unavailable.');
      const cwd = path.resolve(cwdRoot.path, snapshot.cwd.relativePath);
      const requestedPath = path.isAbsolute(params.path) ? path.resolve(params.path) : path.resolve(cwd, params.path);
      const root = snapshot.roots
        .filter(candidate => isWithinRoot(candidate.path, requestedPath))
        .sort((left, right) =>
          path.resolve(right.path).length - path.resolve(left.path).length ||
          Number(left.access !== 'read_only') - Number(right.access !== 'read_only'),
        )[0];
      if (!root) throw new Error('File path is outside the Session Workspace roots.');
      if (!isRead && root.access !== 'read_write') throw new Error('Session Workspace root is read-only.');
      activeWorkspace = root.path;
      input.path = path.relative(root.path, requestedPath) || '.';
      delete input.workspaceSnapshot;
    } else {
      if (!workspace) throw new Error('Device RPC requires an authenticated Workspace Host.');
      activeWorkspace = workspace;
      delete input.workspaceSnapshot;
    }
    const { action, source } = new PermissionPolicy(activeWorkspace).evaluateDecision(isRead ? 'file_read' : method, input);
    if (source === 'invalid') throw new Error('Local permission settings are invalid or unsafe; check the workspace and user settings.');
    if (action === 'deny' || (isRead && action !== 'allow')) throw new Error('Local permission policy denied this device operation.');
    const context = { cwd: activeWorkspace, userId, sessionId, toolCallId };
    const registry = { file_read: read, notebook_read: read, file_write: write, file_edit: fileEdit, file_patch: patch, notebook_edit: edit };
    const result = await executeTool(registry[method], input, context);
    if (result.errorCode === 'validation') throw new Error(`Invalid ${method.replace('_', ' ')}: ${result.error}`);
    if (result.error) throw new Error(result.error);
    return result.data;
  };
}
