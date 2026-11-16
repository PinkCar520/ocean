import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileEditTool } from './file-edit.js';
import { Checkpoints } from '../../utils/checkpoints.js';
import { createFileEditTool } from '../core-tools.js';

it('tracks legacy and Agent edits together and protects subsequent edits during rollback', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ocean-legacy-checkpoint-'));
  const ctx = { cwd, userId: 'u', sessionId: 's', toolCallId: 'rpc-call' };
  try {
    await writeFile(join(cwd, 'a.txt'), 'before');
    expect((await new FileEditTool(cwd).execute({ path: 'a.txt', oldString: 'before', newString: 'rpc' }, ctx)).success).toBe(true);
    const checkpoints = new Checkpoints(ctx);
    const records = await checkpoints.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ toolCallId: 'rpc-call', files: [{ beforeHash: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
    const edited = await createFileEditTool().execute({ path: 'a.txt', old_string: 'rpc', new_string: 'agent' }, ctx);
    await expect(checkpoints.rollback(records[0].id)).rejects.toThrow('conflict');
    await checkpoints.rollback(edited.data.checkpointId);
    await checkpoints.rollback(records[0].id);
    expect(await readFile(join(cwd, 'a.txt'), 'utf8')).toBe('before');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
