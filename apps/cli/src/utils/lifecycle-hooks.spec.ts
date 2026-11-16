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

it('runs structured prompt hooks with fail-closed blocking semantics', async () => {
 const hooks = new LifecycleHooks({ PreToolUse: [{ hooks: [{ type: 'prompt', prompt: 'Check mutation' }] }] }, process.cwd(), {
  evaluatePrompt: async (_prompt, input) => ({ decision: input.tool_name === 'write' ? 'block' : 'allow', reason: 'review required' }),
 });
 expect(await hooks.run('PreToolUse', { tool_name: 'write' })).toMatchObject({ blocked: true, reason: 'review required' });
});

it('fails closed when a prompt evaluator is unavailable', async () => {
 const hooks = new LifecycleHooks({ Stop: [{ hooks: [{ type: 'prompt', prompt: 'Check' }] }] }, process.cwd());
 await expect(hooks.run('Stop', {})).rejects.toThrow('evaluator');
});

import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
it('authorizes only the exact project hook content approved in personal settings', async () => {
 const root = await mkdtemp(join(tmpdir(), 'ocean-hook-trust-'));
 try {
  const home = join(root, 'home'), project = join(root, 'project');
  await mkdir(join(home, '.ocean'), { recursive: true }); await mkdir(join(project, '.ocean'), { recursive: true });
  const raw = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'exit 2' }] }] } });
  await writeFile(join(project, '.ocean', 'hooks.json'), raw);
  await writeFile(join(home, '.ocean', 'hooks.json'), JSON.stringify({ trustedProjects: { [await realpath(project)]: createHash('sha256').update(raw).digest('hex') } }));
  expect((await LifecycleHooks.load(project, home).run('PreToolUse', {})).blocked).toBe(true);
  await writeFile(join(project, '.ocean', 'hooks.json'), raw + ' ');
  expect((await LifecycleHooks.load(project, home).run('PreToolUse', {})).blocked).toBe(false);
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('cancels a pending prompt evaluation without accepting a late allow', async () => {
 const controller = new AbortController();
 const hooks = new LifecycleHooks({ PreToolUse: [{ hooks: [{ type: 'prompt', prompt: 'review' }] }] }, process.cwd(), { evaluatePrompt: async () => new Promise(() => {}) });
 const pending = hooks.run('PreToolUse', {}, controller.signal);
 controller.abort(new Error('cancelled'));
 await expect(pending).rejects.toThrow('cancelled');
});
