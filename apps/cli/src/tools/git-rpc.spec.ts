import { expect, it } from 'vitest';
import { createGitRpc } from './git-rpc.js';
it('rejects remote mutations without an approval channel and validates aliases', async () => {
  const rpc = createGitRpc(process.cwd());
  const ctx = { cwd: process.cwd(), userId: 'u', sessionId: 's', toolCallId: 'push' };
  await expect(rpc('git_push', { remote: 'origin', branch: 'main' }, ctx)).rejects.toThrow('approval');
  await expect(rpc('git_commit', { message: 'x' }, ctx)).rejects.toThrow('approval');
});
