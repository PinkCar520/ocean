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
