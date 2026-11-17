import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { atomicWriteFile } from './file-system.js';

it('keeps the existing file and removes the temporary file when the precommit check fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ocean-atomic-'));
  try {
    const file = path.join(directory, 'notebook.ipynb');
    await writeFile(file, 'external version');
    await expect(atomicWriteFile(file, 'new version', { beforeCommit: async () => { throw new Error('changed'); } })).rejects.toThrow('changed');
    expect(await readFile(file, 'utf8')).toBe('external version');
    expect(await readdir(directory)).toEqual(['notebook.ipynb']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

import { withProcessFileLock } from './file-system.js';
it('serializes cross-process writers and releases the lock directory', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ocean-lock-'));
  try {
    const file = path.join(directory, 'workspace.lock');
    const order: string[] = [];
    let release!: () => void;
    const first = withProcessFileLock(file, async () => {
      order.push('first-start');
      await new Promise<void>((resolve) => { release = resolve; });
      order.push('first-end');
    });
    const deadline = Date.now() + 1000;
    while (!order.includes('first-start')) {
      if (Date.now() > deadline) throw new Error('first lock did not start');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const second = withProcessFileLock(file, async () => { order.push('second'); });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(order).toEqual(['first-start']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('reclaims a stale lock left by a dead process', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ocean-lock-stale-'));
  try {
    const file = path.join(directory, 'workspace.lock');
    const lockDir = `${file}.lock`;
    await import('node:fs/promises').then((fs) => fs.mkdir(lockDir));
    await writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: 99999999, createdAt: new Date(0).toISOString() }));
    await expect(withProcessFileLock(file, async () => 'ran')).resolves.toBe('ran');
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
