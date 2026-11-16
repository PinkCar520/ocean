import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { Checkpoints } from './checkpoints.js';
describe('file checkpoints', () => {
  it('rolls back create/modify/delete and protects subsequent user edits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-cp-'));
    try {
      const cp = new Checkpoints({ cwd: root, userId: 'u', sessionId: 's' });
      await writeFile(join(root, 'a'), 'old');
      const id = await cp.change([{ path: 'a', content: 'new' }, { path: 'b', content: 'created' }]);
      await writeFile(join(root, 'b'), 'user');
      await expect(cp.rollback(id)).rejects.toThrow('conflict');
      expect(await readFile(join(root, 'a'), 'utf8')).toBe('new');
      await writeFile(join(root, 'b'), 'created');
      await cp.rollback(id);
      expect(await readFile(join(root, 'a'), 'utf8')).toBe('old');
      await expect(readFile(join(root, 'b'))).rejects.toThrow();
      const deletion = await cp.change([{ path: 'a', content: null }]);
      await cp.rollback(deletion);
      expect(await readFile(join(root, 'a'), 'utf8')).toBe('old');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

import { execFileSync } from 'node:child_process';
import { createFileWriteTool } from '../tools/core-tools.js';
import { mkdir } from 'node:fs/promises';
it('persists tool identity and rolls back a controlled write in a separate process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-cp-process-'));
  try {
    await writeFile(join(root, 'source.ts'), 'export const value = 1;');
    const result = await createFileWriteTool().execute({ path: 'source.ts', content: 'export const value = 2;' }, { cwd: root, userId: 'u', sessionId: 's', runId: 'r', toolCallId: 't' });
    expect(result.error).toBeUndefined();
    const id = (result.data as any).checkpointId;
    const cp = new Checkpoints({ cwd: root, userId: 'u', sessionId: 's' });
    expect(await cp.get(id)).toMatchObject({ runId: 'r', toolCallId: 't', status: 'applied' });
    const script = `import {Checkpoints} from './src/utils/checkpoints.ts'; const cp=new Checkpoints({cwd:process.argv[1],userId:'u',sessionId:'s'}); await cp.rollback(process.argv[2]); console.log((await cp.get(process.argv[2])).status);`;
    expect(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, root, id], { encoding: 'utf8' }).trim()).toBe('rolled_back');
    expect(await readFile(join(root, 'source.ts'), 'utf8')).toBe('export const value = 1;');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('does not modify the target when snapshot persistence fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-cp-fail-'));
  try {
    await writeFile(join(root, 'source'), 'old');
    await writeFile(join(root, '.ocean'), 'not a directory');
    const result = await createFileWriteTool().execute({ path: 'source', content: 'new' }, { cwd: root, userId: 'u', sessionId: 's' });
    expect(result.error).toBeDefined();
    expect(await readFile(join(root, 'source'), 'utf8')).toBe('old');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('recognizes partially rolled back files and safely completes recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-cp-interrupted-'));
  try {
    const cp = new Checkpoints({ cwd: root, userId: 'u', sessionId: 's' });
    await writeFile(join(root, 'a'), 'old-a');
    await writeFile(join(root, 'b'), 'old-b');
    const id = await cp.change([{ path: 'a', content: 'new-a' }, { path: 'b', content: 'new-b' }]);
    const record = await cp.get(id);
    record.status = 'rolling_back';
    // Simulate a crash between restoring the first and second file.
    await (cp as any).save(record);
    await writeFile(join(root, 'a'), 'old-a');
    await cp.rollback(id);
    expect(await readFile(join(root, 'b'), 'utf8')).toBe('old-b');
    expect((await cp.get(id)).status).toBe('rolled_back');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('recovers after a rollback process exits between two file restores', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-cp-crash-'));
  try {
    const cp = new Checkpoints({ cwd: root, userId: 'u', sessionId: 's' });
    await writeFile(join(root, 'a'), 'old-a');
    await writeFile(join(root, 'b'), 'old-b');
    const id = await cp.change([{ path: 'a', content: 'new-a' }, { path: 'b', content: 'new-b' }]);
    const script = `import {Checkpoints} from './src/utils/checkpoints.ts'; const cp=new Checkpoints({cwd:process.argv[1],userId:'u',sessionId:'s'}); const original=cp.write.bind(cp); cp.write=async (...args)=>{await original(...args); process.exit(77)}; await cp.rollback(process.argv[2]);`;
    try { execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, root, id]); throw new Error('Expected interrupted process'); }
    catch (error) { expect((error as any).status).toBe(77); }
    expect((await cp.get(id)).status).toBe('rolling_back');
    expect(await readFile(join(root, 'a'), 'utf8')).toBe('old-a');
    expect(await readFile(join(root, 'b'), 'utf8')).toBe('new-b');
    await cp.rollback(id);
    expect(await readFile(join(root, 'b'), 'utf8')).toBe('old-b');
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { symlink } from 'node:fs/promises';
it('rejects stale edits, symlink targets, and paths outside the workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-cp-path-'));
  try {
    const cp = new Checkpoints({ cwd: root, userId: 'u', sessionId: 's' });
    await writeFile(join(root, 'source'), 'user edit');
    await expect(cp.change([{ path: 'source', content: 'agent', expectedBefore: 'stale' }])).rejects.toThrow('conflict');
    await symlink(join(root, 'source'), join(root, 'alias'));
    await expect(cp.change([{ path: 'alias', content: 'agent' }])).rejects.toThrow('symlink');
    await expect(cp.change([{ path: '../outside', content: 'agent' }])).rejects.toThrow('outside');
    expect(await readFile(join(root, 'source'), 'utf8')).toBe('user edit');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects a change made after atomic staging but before replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-cp-window-'));
  try {
    const { atomicWriteFile } = await import('./file-system.js');
    const file = join(root, 'a'); await writeFile(file, 'old');
    await expect(atomicWriteFile(file, 'agent', { beforeCommit: async () => { await writeFile(file, 'user'); } })).rejects.toThrow('conflict');
    expect(await readFile(file, 'utf8')).toBe('user');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects a competing process while a workspace mutation holds the lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ocean-cp-compete-'));
  try {
    const { withProcessFileLock } = await import('./file-system.js');
    await mkdir(join(root, '.ocean', 'checkpoints'), { recursive: true });
    await writeFile(join(root, 'a'), 'user');
    await withProcessFileLock(join(root, '.ocean', 'checkpoints', '.workspace.lock'), async () => {
      const script = `import {Checkpoints} from './src/utils/checkpoints.ts'; try {await new Checkpoints({cwd:process.argv[1],userId:'other',sessionId:'other'}).change([{path:'a',content:'overwritten'}]);process.exitCode=2;} catch(e){console.log(e.message);}`;
      expect(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, root], { encoding: 'utf8' })).toContain('conflict');
    });
    expect(await readFile(join(root, 'a'), 'utf8')).toBe('user');
    const cp = new Checkpoints({ cwd: root, userId: 'u', sessionId: 's' });
    await cp.change([{ path: 'a', content: 'safe', expectedBefore: 'user' }]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
