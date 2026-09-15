import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, normalize, relative, isAbsolute } from 'path';

export interface ArtifactRecord {
  id: string;
  runId: string;
  name: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

/**
 * ArtifactStore —— 本地对象存储（Phase 4 第 8 项，借鉴 K6：大产物不入 PG）。
 * 内容写 ARTIFACT_ROOT 目录（默认 <cwd>/artifacts/<runId>/<artifactId>），
 * 数据库只落 RunArtifact 引用（storageKey + sizeBytes）。storageKey 形如
 * "<runId>/<artifactId>"；读取时做路径穿越校验（归一化后必须仍在 root 内）。
 */
@Injectable()
export class ArtifactStore {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly root: string = join(process.cwd(), 'artifacts'),
  ) {}

  async save(
    runId: string,
    name: string,
    content: string,
  ): Promise<ArtifactRecord> {
    const id = randomUUID();
    const storageKey = `${runId}/${id}`;
    const filePath = this.resolvePath(storageKey);
    mkdirSync(this.resolvePath(runId), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
    const record = await this.prisma.runArtifact.create({
      data: {
        id,
        runId,
        name,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        storageKey,
      },
    });
    return record;
  }

  async load(runId: string, artifactId: string): Promise<string> {
    const record = await this.prisma.runArtifact.findFirst({
      where: { id: artifactId, runId },
    });
    if (!record)
      throw new Error(`Artifact ${artifactId} not found for run ${runId}`);
    return readFileSync(this.resolvePath(record.storageKey), 'utf8');
  }

  /** 路径穿越校验：key 归一化后必须仍在 root 内。 */
  resolvePath(key: string): string {
    const root = normalize(this.root);
    const candidate = normalize(join(root, key));
    const rel = relative(root, candidate);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Illegal artifact path: ${key}`);
    }
    return candidate;
  }
}
