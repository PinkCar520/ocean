import { describe, expect, it } from 'vitest';

import {
  workspaceConfigurationSchema,
  workspaceRecordSchema,
  workspaceSnapshotSchema,
} from './workspace.js';

const snapshot = {
  name: 'Ocean Workspace',
  schemaVersion: 1 as const,
  workspaceId: '00000000-0000-4000-8000-000000000001',
  workspaceRevision: 1,
  hostId: '00000000-0000-4000-8000-000000000002',
  platform: 'darwin' as const,
  roots: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      label: 'Ocean',
      path: '/Users/example/Ocean',
      role: 'primary' as const,
      access: 'read_write' as const,
    },
    {
      id: '00000000-0000-4000-8000-000000000004',
      label: 'Shared docs',
      path: '/Users/example/Documents',
      role: 'additional' as const,
      access: 'read_only' as const,
    },
  ],
  cwd: {
    rootId: '00000000-0000-4000-8000-000000000003',
    relativePath: 'packages/contracts',
  },
  worktree: { enabled: false },
};

describe('workspace snapshot contract', () => {
  it('accepts a reusable Workspace configuration', () => {
    const { name, hostId, platform, roots, cwd, worktree } = snapshot;

    expect(
      workspaceConfigurationSchema.parse({
        name,
        hostId,
        platform,
        roots,
        cwd,
        worktree,
      }),
    ).toEqual({ name, hostId, platform, roots, cwd, worktree });
  });

  it('accepts persisted Workspace records and ignores server timestamps', () => {
    const { workspaceId, workspaceRevision, schemaVersion, ...configuration } =
      snapshot;
    const record = {
      ...configuration,
      id: workspaceId,
      revision: workspaceRevision,
      status: 'active',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    };

    expect(workspaceRecordSchema.parse(record)).toEqual({
      ...configuration,
      id: workspaceId,
      revision: workspaceRevision,
      status: 'active',
    });
  });

  it('accepts a multi-root Session snapshot with an in-root CWD', () => {
    expect(workspaceSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('accepts Windows roots and a Windows-relative CWD', () => {
    const windowsSnapshot = {
      ...snapshot,
      platform: 'win32' as const,
      roots: snapshot.roots.map((root, index) => ({
        ...root,
        path: index === 0 ? 'C:\\Users\\example\\Ocean' : 'D:\\Shared',
      })),
      cwd: { ...snapshot.cwd, relativePath: 'packages\\contracts' },
    };

    expect(workspaceSnapshotSchema.parse(windowsSnapshot)).toEqual(
      windowsSnapshot,
    );
  });

  it('rejects a CWD outside all authorized roots', () => {
    const result = workspaceSnapshotSchema.safeParse({
      ...snapshot,
      cwd: { ...snapshot.cwd, rootId: '00000000-0000-4000-8000-000000000099' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects traversal in a relative CWD', () => {
    const result = workspaceSnapshotSchema.safeParse({
      ...snapshot,
      cwd: { ...snapshot.cwd, relativePath: '../secrets' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an absolute path as a relative CWD', () => {
    const result = workspaceSnapshotSchema.safeParse({
      ...snapshot,
      cwd: { ...snapshot.cwd, relativePath: '/private/data' },
    });

    expect(result.success).toBe(false);
  });

  it('only allows a Worktree for the primary root', () => {
    const result = workspaceSnapshotSchema.safeParse({
      ...snapshot,
      worktree: {
        enabled: true,
        rootId: '00000000-0000-4000-8000-000000000004',
      },
    });

    expect(result.success).toBe(false);
  });

  it('requires write access on the primary root for a Worktree', () => {
    const result = workspaceSnapshotSchema.safeParse({
      ...snapshot,
      roots: snapshot.roots.map((root) =>
        root.role === 'primary' ? { ...root, access: 'read_only' } : root,
      ),
      worktree: {
        enabled: true,
        rootId: '00000000-0000-4000-8000-000000000003',
      },
    });

    expect(result.success).toBe(false);
  });
});
