import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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

  it('scopes session lookup to the workspace and rejects path-shaped ids', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ocean-sessions-'));
    const store = new SessionStore(path.join(tempRoot, 'sessions'));
    const session = await store.create(path.join(tempRoot, 'workspace-a'));
    await expect(store.load(session.id, path.join(tempRoot, 'workspace-b'))).rejects.toThrow('different workspace');
    await expect(store.load('../credentials', session.workspace)).rejects.toThrow('Invalid session id');
    expect(await readFile(path.join(tempRoot, 'sessions', `${session.id}.json`), 'utf-8')).toContain(session.id);
  });
});
