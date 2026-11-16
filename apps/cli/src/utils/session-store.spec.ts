import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore } from './session-store.js';

describe('CLI local session store', () => {
  let tempRoot: string;

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
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
