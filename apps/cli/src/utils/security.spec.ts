import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecurityEngine } from './security.js';
import { createFileEditTool, createFilePatchTool, createFileWriteTool, createGrepTool } from '../tools/core-tools.js';
import { FileEditTool as LocalFileEditTool } from '../tools/local/file-edit.js';

describe('CLI workspace security', () => {
  let parent: string;
  let workspace: string;
  let outside: string;

  beforeEach(async () => {
    parent = await mkdtemp(path.join(os.tmpdir(), 'ocean-cli-security-'));
    workspace = path.join(parent, 'workspace');
    outside = path.join(parent, 'outside');
    await mkdir(workspace);
    await mkdir(outside);
  });

  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });

  it('rejects traversal, absolute outside paths, and symlink escapes', async () => {
    const security = new SecurityEngine(workspace);
    expect(security.validatePath('../workspace-sibling/file')).toMatchObject({ isValid: false });
    await expect(security.resolveWorkspacePath('../outside/file')).rejects.toThrow('outside workspace');

    await symlink(outside, path.join(workspace, 'escape'), 'dir');
    await expect(security.resolveWorkspacePath('escape/secret.txt')).rejects.toThrow('resolves outside workspace');
  });

  it('resolves new nested paths inside the workspace', async () => {
    const resolved = await new SecurityEngine(workspace).resolveWorkspacePath('new/deep/file.ts');
    const canonicalWorkspace = await import('node:fs/promises').then(({ realpath }) => realpath(workspace));
    expect(resolved).toBe(path.join(canonicalWorkspace, 'new/deep/file.ts'));
  });

  it('keeps credential-like files out of model-visible reads while allowing templates', async () => {
    await writeFile(path.join(workspace, '.env'), 'SECRET=value');
    await writeFile(path.join(workspace, '.env.example'), 'KEY=placeholder');
    const security = new SecurityEngine(workspace);
    await expect(security.resolveReadablePath('.env')).rejects.toThrow('credential-like');
    await expect(security.resolveReadablePath('.env.example')).resolves.toContain('.env.example');
  });

  it('requires approval for file writes and edits', () => {
    expect(createFileWriteTool().requiresApproval).toBe(true);
    expect(createFileEditTool().requiresApproval).toBe(true);
    expect(createFilePatchTool().requiresApproval).toBe(true);
  });

  it('refuses ambiguous file edits without changing the target', async () => {
    const target = path.join(workspace, 'duplicate.txt');
    await writeFile(target, 'repeat repeat');
    const result = await createFileEditTool().execute(
      { path: 'duplicate.txt', old_string: 'repeat', new_string: 'changed' },
      { cwd: workspace, userId: 'u1', sessionId: 's1' },
    );
    expect(result.error).toContain('ambiguous');
    expect(await readFile(target, 'utf-8')).toBe('repeat repeat');
  });

  it('blocks legacy RPC edits through symlinks and rejects empty matches', async () => {
    const outsideFile = path.join(outside, 'protected.txt');
    await writeFile(outsideFile, 'do not change');
    await symlink(outsideFile, path.join(workspace, 'link.txt'));
    const tool = new LocalFileEditTool(workspace);

    const escaped = await tool.execute({ path: 'link.txt', oldString: 'do not', newString: 'changed' });
    const emptyMatch = await tool.execute({ path: 'protected.txt', oldString: '', newString: 'changed' });
    expect(escaped.success).toBe(false);
    expect(emptyMatch.error).toContain('must not be empty');
    expect(await readFile(outsideFile, 'utf-8')).toBe('do not change');
  });

  it('applies exact non-overlapping patches atomically and protects credential files', async () => {
    const target = path.join(workspace, 'patch.txt');
    await writeFile(target, 'alpha\nbeta\ngamma\n');
    const patch = createFilePatchTool();
    const result = await patch.execute({
      path: 'patch.txt',
      edits: [
        { old_string: 'alpha', new_string: 'first' },
        { old_string: 'gamma', new_string: 'last' },
      ],
    }, { cwd: workspace, userId: 'u1', sessionId: 's1' });
    expect(result.data.appliedEdits).toBe(2);
    expect(await readFile(target, 'utf-8')).toBe('first\nbeta\nlast\n');

    const envPath = path.join(workspace, '.env');
    await writeFile(envPath, 'TOKEN=secret');
    const deniedEdit = await createFileEditTool().execute({
      path: '.env', old_string: 'TOKEN', new_string: 'OTHER',
    }, { cwd: workspace, userId: 'u1', sessionId: 's1' });
    const deniedPatch = await patch.execute({
      path: '.env', edits: [{ old_string: 'TOKEN', new_string: 'OTHER' }],
    }, { cwd: workspace, userId: 'u1', sessionId: 's1' });
    expect(deniedEdit.error).toContain('credential-like');
    expect(deniedPatch.error).toContain('credential-like');
    expect(await readFile(envPath, 'utf-8')).toBe('TOKEN=secret');
  });

  it('rejects ambiguous and overlapping patch anchors without partial writes', async () => {
    const target = path.join(workspace, 'overlap.txt');
    await writeFile(target, 'abcd repeat repeat');
    const patch = createFilePatchTool();
    const ambiguous = await patch.execute({
      path: 'overlap.txt', edits: [{ old_string: 'repeat', new_string: 'once' }],
    }, { cwd: workspace, userId: 'u1', sessionId: 's1' });
    const overlapping = await patch.execute({
      path: 'overlap.txt', edits: [
        { old_string: 'abc', new_string: 'x' },
        { old_string: 'bcd', new_string: 'y' },
      ],
    }, { cwd: workspace, userId: 'u1', sessionId: 's1' });
    expect(ambiguous.error).toContain('ambiguous');
    expect(overlapping.error).toContain('overlap');
    expect(await readFile(target, 'utf-8')).toBe('abcd repeat repeat');
  });

  it('cancels a pending file patch before any write', async () => {
    const target = path.join(workspace, 'cancel.txt');
    await writeFile(target, 'before');
    const controller = new AbortController();
    controller.abort(new Error('cancelled by user'));
    const result = await createFilePatchTool().execute({
      path: 'cancel.txt',
      edits: [{ old_string: 'before', new_string: 'after' }],
    }, { cwd: workspace, userId: 'u1', sessionId: 's1', signal: controller.signal });

    expect(result.error).toBe('cancelled by user');
    expect(await readFile(target, 'utf-8')).toBe('before');
  });

  it('searches patterns without invoking a shell', async () => {
    await writeFile(path.join(workspace, 'sample.txt'), 'needle here\n');
    const marker = path.join(outside, 'injected');
    const result = await createGrepTool().execute(
      { pattern: `needle'; touch ${marker}; echo '` },
      { cwd: workspace, userId: 'u1', sessionId: 's1' },
    );
    expect(result.error).toBeUndefined();
    expect(result.data.matches).toEqual([]);
    await expect(import('node:fs/promises').then(({ access }) => access(marker))).rejects.toThrow();
  });
});
