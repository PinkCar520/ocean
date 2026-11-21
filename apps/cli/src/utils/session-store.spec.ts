import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir, utimes, readdir } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore } from './session-store.js';

describe('CLI local session store', () => {
  let tempRoot: string;

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it('forks a conversation without inheriting the worktree or rewriting the original', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-session-fork-'));
    const store = new SessionStore(path.join(tempRoot, 'sessions'));
    const original = await store.create(tempRoot);
    await store.save(original.id, tempRoot, [{ role: 'user', content: 'Original prompt' }]);
    await store.saveWorktree(original.id, tempRoot, { path: '/fixture/worktree', branch: 'original' });
    const fork = await store.fork(original.id, tempRoot);
    expect(fork.id).not.toBe(original.id);
    expect(fork.worktree).toBeUndefined();
    expect(fork.messages).toEqual([{ role: 'user', content: 'Original prompt' }]);
    await store.save(fork.id, tempRoot, [...fork.messages, { role: 'user', content: 'Follow-up' }]);
    expect((await store.load(original.id, tempRoot)).messages).toEqual(fork.messages);
  });

  it('persists and resumes complete model/tool messages with private file permissions', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-sessions-'));
    const store = new SessionStore(path.join(tempRoot, 'sessions'));
    const session = await store.create(path.join(tempRoot, 'workspace'));
    const messages = [
      { role: 'user', content: 'Review this change' },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'file_read', input: { path: 'a.ts' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'file_read', output: { content: 'code' } }] },
    ] as any;
    await store.save(session.id, session.workspace, messages);

    const resumed = await store.load(session.id, session.workspace);
    const fileInfo = await stat(path.join(tempRoot, 'sessions', `${session.id}.json`));
    expect(resumed.title).toBe('Review this change');
    expect(resumed.messages).toEqual(messages);
    expect(fileInfo.mode & 0o777).toBe(0o600);
    expect(await store.latestOrCreate(session.workspace)).toMatchObject({ id: session.id });
  });

  it('rejects a restored tool result belonging to another call', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-sessions-'));
    const store = new SessionStore(path.join(tempRoot, 'sessions'));
    const session = await store.create(tempRoot);
    await expect(store.save(session.id, tempRoot, [
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'missing', toolName: 'file_read', output: {} }] },
    ] as any)).rejects.toThrow('tool result');
  });

  it('restores persisted context in a separate Node process', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-sessions-'));
    const root = path.join(tempRoot, 'sessions');
    const store = new SessionStore(root);
    const session = await store.create(tempRoot);
    await store.save(session.id, tempRoot, [{ role: 'user', content: 'remember this' }]);
    const script = `import { SessionStore } from './src/utils/session-store.ts'; const s = await new SessionStore(process.argv[1]).load(process.argv[2], process.argv[3]); console.log(JSON.stringify(s.messages));`;
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, root, session.id, tempRoot], { cwd: process.cwd(), encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual([{ role: 'user', content: 'remember this' }]);
  });

  it('scopes session lookup to the workspace and rejects path-shaped ids', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-sessions-'));
    const store = new SessionStore(path.join(tempRoot, 'sessions'));
    const session = await store.create(path.join(tempRoot, 'workspace-a'));
    await expect(store.load(session.id, path.join(tempRoot, 'workspace-b'))).rejects.toThrow('different workspace');
    await expect(store.load('../credentials', session.workspace)).rejects.toThrow('Invalid session id');
    expect(await readFile(path.join(tempRoot, 'sessions', `${session.id}.json`), 'utf-8')).toContain(session.id);
  });
});

it('persists provider usage and drops it when the transcript shrinks', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-usage-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  const messages = [{ role: 'user', content: 'first' }] as any;
  await store.save(session.id, root, messages);
  await store.saveUsage(session.id, root, { totalTokens: 120, messageCount: 1 });
  expect((await store.load(session.id, root)).usage).toEqual({ totalTokens: 120, messageCount: 1 });
  await expect(store.saveUsage(session.id, root, { totalTokens: -1, messageCount: 1 })).rejects.toThrow('usage');
  await expect(store.saveUsage(session.id, root, { totalTokens: 1, messageCount: 2 })).rejects.toThrow('usage');
  await store.save(session.id, root, []);
  expect((await store.load(session.id, root)).usage).toBeUndefined();
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects a corrupt persisted usage snapshot', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-usage-bad-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  const file = path.join(root, `${session.id}.json`);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify({ ...raw, usage: { totalTokens: 1, messageCount: 99 } }));
  await expect(store.load(session.id, root)).rejects.toThrow('usage');
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('keeps the in-memory revision current after compaction and usage writes', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-meta-rev-'));
 try {
  const store = new SessionStore(root); let session = await store.create(root);
  session = await store.save(session.id, root, [{ role: 'user', content: 'one' }] as any);
  session = await store.saveCompaction(session.id, root, { covered: 0, digest: 'x', summary: 's' });
  session = await store.saveUsage(session.id, root, { totalTokens: 5, messageCount: 1 });
  await expect(store.save(session.id, root, [{ role: 'user', content: 'one' }, { role: 'assistant', content: 'two' }] as any)).resolves.toBeDefined();
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('recovers a completed tool journal when the turn snapshot was lost', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-journal-recover-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await store.save(session.id, root, [{ role: 'user', content: 'write it' }] as any);
  await store.executeToolCall(session.id, root, 'call-1', 'file_write', { path: 'a.txt' }, async () => ({ ok: true, path: 'a.txt' }));
  const recovered = await new SessionStore(root).load(session.id, root);
  expect(recovered.messages).toHaveLength(3);
  expect(recovered.messages[1]).toMatchObject({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'file_write', input: { path: 'a.txt' } }] });
  expect(recovered.messages[2]).toMatchObject({ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'file_write', output: { ok: true, path: 'a.txt' } }] });
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('does not synthesize a result from an unknown journal and prunes only terminal old entries', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-journal-prune-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await store.save(session.id, root, [{ role: 'user', content: 'write it' }] as any);
  await expect(store.executeToolCall(session.id, root, 'call-unknown', 'file_write', { path: 'a' }, async () => { throw new Error('interrupted'); })).rejects.toThrow('interrupted');
  expect((await new SessionStore(root).load(session.id, root)).messages).toHaveLength(1);
  await store.executeToolCall(session.id, root, 'call-done', 'file_write', { path: 'b' }, async () => ({ ok: true }));
  const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
  for (const name of await readdir(root)) {
    if (name.startsWith('journal-')) await utimes(path.join(root, name), new Date(old), new Date(old));
  }
  expect(await store.pruneJournal()).toBe(1);
  expect((await readdir(root)).filter((name) => name.startsWith('journal-'))).toHaveLength(1);
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('marks a running subagent unknown when its heartbeat is stale despite a live PID', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-subagent-stale-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await store.saveSubagent(session.id, root, {
   ownerPid: process.pid, parentSessionId: 'parent', toolCallId: 'call', agent: 'review',
   inputDigest: 'digest', status: 'running',
  });
  const file = path.join(root, `${session.id}.json`);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  raw.subagent.updatedAt = new Date(Date.now() - 60_000).toISOString();
  await writeFile(file, JSON.stringify(raw));
  expect((await store.load(session.id, root)).subagent?.status).toBe('unknown');
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects stale snapshot writes instead of silently losing another update', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-cas-'));
 try {
  const a = new SessionStore(root), b = new SessionStore(root);
  const s = await a.create(root);
  const stale = await b.load(s.id, root);
  await a.save(s.id, root, [{ role: 'user', content: 'first' }]);
  await expect((b as any).write({ ...stale, title: 'stale' })).rejects.toThrow('conflict');
  expect((await a.load(s.id, root)).messages).toEqual([{ role: 'user', content: 'first' }]);
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('loads legacy snapshots and ignores interrupted temporary and corrupt records', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-recovery-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  const legacy = { ...session }; delete legacy.revision;
  await writeFile(path.join(root, `${session.id}.json`), JSON.stringify(legacy));
  await writeFile(path.join(root, `${session.id}.json.crash.ocean-tmp`), '{');
  await writeFile(path.join(root, 'broken.json'), '{');
  await mkdir(path.join(root, `${session.id}.json.lock`));
  expect((await store.load(session.id, root)).messages).toEqual([]);
  expect(await store.list(root)).toHaveLength(1);
  await expect(store.save(session.id, root, [])).rejects.toThrow('conflict');
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('applies configured retention and rejects invalid retention values', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-retention-'));
 try {
  const store = new SessionStore(root, { journalRetentionMs: 1000 });
  const session = await store.create(root);
  await store.executeToolCall(session.id, root, 'done', 'write', {}, async () => ({ ok: true }));
  for (const file of await readdir(root)) if (file.startsWith('journal-')) {
   const old = new Date(Date.now() - 2000); await utimes(path.join(root, file), old, old);
  }
  expect(await store.pruneJournal()).toBe(1);
  expect(() => new SessionStore(root, { journalRetentionMs: -1 })).toThrow('retention');
 } finally { await rm(root, { recursive: true, force: true }); }
});

it('reconciles unknown journals only from an exact terminal provider result without executing again', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-reconcile-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await expect(store.executeToolCall(session.id, root, 'call', 'write', { a: 1 }, async () => { throw new Error('lost result'); })).rejects.toThrow();
  expect(await store.reconcileToolCall(session.id, root, 'call', async identity => ({ ...identity, state: 'unknown' }))).toBe(false);
  await expect(store.reconcileToolCall(session.id, root, 'call', async identity => ({ ...identity, inputDigest: 'wrong', state: 'succeeded', output: { ok: true } }))).rejects.toThrow('identity');
  expect(await store.reconcileToolCall(session.id, root, 'call', async identity => ({ ...identity, state: 'succeeded', output: { ok: true } }))).toBe(true);
  expect(await store.executeToolCall(session.id, root, 'call', 'write', { a: 1 }, async () => { throw new Error('must not execute'); })).toEqual({ ok: true });
 } finally { await rm(root, { recursive: true, force: true }); }
});


it('recovers a persisted failed terminal tool result without replaying its side effect', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-failed-journal-recover-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await store.save(session.id, root, [{ role: 'user', content: 'attempt tool' }] as any);
  let calls = 0;
  const result = { error: 'permission denied' };
  expect(await store.executeToolCall(session.id, root, 'failed-call', 'file_write', { path: 'blocked' }, async () => { calls++; return result; })).toEqual(result);
  const restored = await new SessionStore(root).load(session.id, root);
  expect(restored.messages).toHaveLength(3);
  expect(restored.messages[2]).toMatchObject({ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'failed-call', toolName: 'file_write', output: result }] });
  expect(await store.executeToolCall(session.id, root, 'failed-call', 'file_write', { path: 'blocked' }, async () => { calls++; throw new Error('replayed'); })).toEqual(result);
  expect(calls).toBe(1);
 } finally { await rm(root, { recursive: true, force: true }); }
});


it('reconstructs a reconciled failed journal after a lost tool result', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-reconciled-failed-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await store.save(session.id, root, [{ role: 'user', content: 'run tool' }] as any);
  await expect(store.executeToolCall(session.id, root, 'failed-reconciled', 'remote_tool', { id: 1 }, async () => { throw new Error('connection lost'); })).rejects.toThrow('connection lost');
  expect(await store.reconcileToolCall(session.id, root, 'failed-reconciled', async identity => ({ ...identity, state: 'failed', output: { error: 'remote rejected' } }))).toBe(true);
  const recovered = await new SessionStore(root).load(session.id, root);
  expect(recovered.messages).toHaveLength(3);
  expect(recovered.messages[2]).toMatchObject({ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'failed-reconciled', toolName: 'remote_tool', output: { error: 'remote rejected' } }] });
 } finally { await rm(root, { recursive: true, force: true }); }
});


it('ignores forged terminal journals with mismatched filenames or absent outputs', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-journal-integrity-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await store.save(session.id, root, [{ role: 'user', content: 'safe recovery' }] as any);
  await store.executeToolCall(session.id, root, 'real-call', 'file_read', { path: 'a' }, async () => ({ ok: true }));
  const journalName = (await readdir(root)).find(name => name.startsWith('journal-') && name.endsWith('.json'))!;
  const journal = JSON.parse(await readFile(path.join(root, journalName), 'utf8'));
  await writeFile(path.join(root, 'journal-forged.json'), JSON.stringify({ ...journal, toolCallId: 'forged-call', output: { ok: false } }));
  await writeFile(path.join(root, journalName), JSON.stringify({ ...journal, output: undefined }));
  const restored = await new SessionStore(root).load(session.id, root);
  expect(restored.messages).toEqual([{ role: 'user', content: 'safe recovery' }]);
 } finally { await rm(root, { recursive: true, force: true }); }
});


it('rejects a terminal journal whose persisted input no longer matches its digest', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'ocean-journal-digest-'));
 try {
  const store = new SessionStore(root); const session = await store.create(root);
  await store.save(session.id, root, [{ role: 'user', content: 'run' }] as any);
  await store.executeToolCall(session.id, root, 'digest-call', 'file_write', { path: 'safe.txt' }, async () => ({ ok: true }));
  const journalName = (await readdir(root)).find(name => name.startsWith('journal-') && name.endsWith('.json'))!;
  const journal = JSON.parse(await readFile(path.join(root, journalName), 'utf8'));
  journal.input = { path: 'tampered.txt' };
  await writeFile(path.join(root, journalName), JSON.stringify(journal));
  expect((await new SessionStore(root).load(session.id, root)).messages).toEqual([{ role: 'user', content: 'run' }]);
 } finally { await rm(root, { recursive: true, force: true }); }
});
