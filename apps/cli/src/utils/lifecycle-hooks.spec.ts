import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { LifecycleHooks } from './lifecycle-hooks.js';
describe('lifecycle command hooks', () => {
  it('matches tool names and blocks on exit 2', async () => {
    const hooks = new LifecycleHooks({ PreToolUse: [{ matcher: '^write$', hooks: [{ type: 'command', command: 'exit 2' }] }] }, process.cwd());
    expect((await hooks.run('PreToolUse', { tool_name: 'read' })).blocked).toBe(false);
    expect((await hooks.run('PreToolUse', { tool_name: 'write' })).blocked).toBe(true);
  });
  it('interprets protocol deny without granting allow authority', async () => {
    const hooks = new LifecycleHooks({ PreToolUse: [{ hooks: [{ type: 'command', command: `printf '%s' '{"hookSpecificOutput":{"permissionDecision":"deny"}}'` }] }] }, process.cwd());
    expect((await hooks.run('PreToolUse', {})).blocked).toBe(true);
  });
  it('ignores repository configuration even when it contains executable commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-hooks-'));
    try {
      await mkdir(join(root, '.ocean'));
      await writeFile(join(root, '.ocean', 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'exit 2' }] }] } }));
      expect((await LifecycleHooks.load(root, join(root, 'empty-home')).run('Stop', {})).blocked).toBe(false);
      expect((await LifecycleHooks.load(root, root).run('Stop', {})).blocked).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('cancels a running command and rejects malformed protocol output', async () => {
    const hooks = new LifecycleHooks({ Stop: [{ hooks: [{ type: 'command', command: 'sleep 10' }] }] }, process.cwd());
    const controller = new AbortController();
    const pending = hooks.run('Stop', {}, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    const invalid = new LifecycleHooks({ Stop: [{ hooks: [{ type: 'command', command: 'printf invalid' }] }] }, process.cwd());
    await expect(invalid.run('Stop', {})).rejects.toThrow('JSON');
  });
  it('terminates timed out commands', async () => {
    const hooks = new LifecycleHooks({ Stop: [{ hooks: [{ type: 'command', command: 'sleep 10', timeout: 0.02 }] }] }, process.cwd());
    await expect(hooks.run('Stop', {})).rejects.toThrow('timeout');
  });
});
