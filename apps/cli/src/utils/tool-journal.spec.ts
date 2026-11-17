import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from './session-store.js';
it('persists identity before execution and refuses unknown replay after recovery', async () => {
 const root = await mkdtemp(join(tmpdir(), 'journal-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await expect(store.executeToolCall(session.id, root, 'call', 'write', { path: 'x' }, async () => { throw new Error('interrupted'); })).rejects.toThrow('interrupted');
  const recovered = new SessionStore(root);
  await expect(recovered.executeToolCall(session.id, root, 'call', 'write', { path: 'x' }, async () => 'replayed')).rejects.toThrow('unknown');
 } finally { await rm(root, { recursive: true, force: true }); }
});

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { vi } from 'vitest';
it.each(['file_write', 'delegate_task'])('P0: %s process exits after side effect; recovery must not replay', async (name) => {
 const root = await mkdtemp(join(tmpdir(), 'journal-kill-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  // Trigger: exit after the observable effect, before executeToolCall can persist output.
  const script = `import {SessionStore} from './src/utils/session-store.ts'; import {writeFile} from 'node:fs/promises'; await new SessionStore(process.argv[1]).executeToolCall(process.argv[2],process.argv[1],'call',process.argv[3],{},async()=>{await writeFile(process.argv[1]+'/effect','once');process.exit(77)});`;
  try { execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e',script,root,session.id,name]); throw new Error('Expected exit'); }
  catch (error) { expect((error as any).status).toBe(77); }
  // Expected: durable executing identity. Forbidden: a second write/child invocation.
  const replay = vi.fn();
  await expect(new SessionStore(root).executeToolCall(session.id,root,'call',name,{},replay)).rejects.toThrow('unknown');
  expect(replay).not.toHaveBeenCalled();
  // Recovery verification: original effect and complete session remain readable.
  expect(await readFile(join(root,'effect'),'utf8')).toBe('once');
  expect((await store.load(session.id,root)).messages).toEqual([]);
 } finally { await rm(root,{recursive:true,force:true}); }
});

it('refuses replay after a real SIGKILL following an fsynced filesystem side effect', async () => {
 const root = await mkdtemp(join(tmpdir(), 'journal-sigkill-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  const script = `import {SessionStore} from './src/utils/session-store.ts';import {open} from 'node:fs/promises';await new SessionStore(process.argv[1]).executeToolCall(process.argv[2],process.argv[1],'crash','write',{},async()=>{const h=await open(process.argv[1]+'/effect','w');await h.writeFile('once');await h.sync();await h.close();const d=await open(process.argv[1],'r');await d.sync();await d.close();process.kill(process.pid,'SIGKILL');await new Promise(()=>{});});`;
  try { execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e',script,root,session.id]); throw new Error('Expected SIGKILL'); }
  catch (error) { expect((error as any).signal).toBe('SIGKILL'); }
  const replay = vi.fn();
  await expect(new SessionStore(root).executeToolCall(session.id,root,'crash','write',{},replay)).rejects.toThrow('unknown');
  expect(replay).not.toHaveBeenCalled();
  expect(await readFile(join(root,'effect'),'utf8')).toBe('once');
 } finally { await rm(root,{recursive:true,force:true}); }
});
