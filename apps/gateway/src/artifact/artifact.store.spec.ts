import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { ArtifactStore } from './artifact.store';

describe('ArtifactStore (Phase 4.8 artifact storage separation)', () => {
  const root = mkdtempSync(join(tmpdir(), 'artifact-store-spec-'));
  let store: ArtifactStore;
  const prisma = {
    runArtifact: {
      create: jest.fn(async ({ data }: any) => ({
        ...data,
        createdAt: new Date('2026-09-15T04:00:00.000Z'),
      })),
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    store = new ArtifactStore(prisma as never, root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('persists a large payload to disk and returns only a reference record', async () => {
    const big = 'x'.repeat(200_000);
    const record = await store.save('run_1', 'report.json', big);

    expect(record.storageKey).toBe(`run_1/${record.id}`);
    expect(record.sizeBytes).toBe(200_000);
    // 内容在文件系统，不在 DB 记录里
    expect(prisma.runArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ content: expect.anything() }),
      }),
    );
    expect(readFileSync(join(root, record.storageKey), 'utf8')).toBe(big);
  });

  it('loads content back by runId + artifactId with ownership check', async () => {
    prisma.runArtifact.findFirst.mockResolvedValueOnce({
      id: 'art_1',
      runId: 'run_1',
      name: 'f.txt',
      sizeBytes: 5,
      storageKey: 'run_1/art_1',
    });
    store = new ArtifactStore(prisma as never, root);
    // 预写文件
    const { writeFileSync } = require('fs');
    writeFileSync(join(root, 'run_1/art_1'), 'hello', 'utf8');

    const content = await store.load('run_1', 'art_1');
    expect(content).toBe('hello');
  });

  it('rejects path traversal storage keys', () => {
    store = new ArtifactStore(prisma as never, root);
    expect(() => store.resolvePath('../escape.txt')).toThrow(/Illegal artifact path/);
    expect(() => store.resolvePath('run_1/../../etc/passwd')).toThrow(/Illegal artifact path/);
  });
});
