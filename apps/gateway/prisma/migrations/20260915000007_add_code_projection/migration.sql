-- Phase 6 6c：Code 投影数据模型 + 种子 Code Space
-- 建表 → 种子 code space（id='code'）→ 现有用户 membership 回填 → 索引/FK

-- CreateTable
CREATE TABLE "code_repositories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "path" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'git',
    "lastSyncedAt" TIMESTAMP(3),
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_diffs" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "baseRef" TEXT NOT NULL DEFAULT 'main',
    "headRef" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "filesChanged" INTEGER NOT NULL DEFAULT 0,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_diffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_reviews" (
    "id" TEXT NOT NULL,
    "diffId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_reviews_pkey" PRIMARY KEY ("id")
);

-- Seed：Code Space（组织共享工作区，所有现有用户可访问）
INSERT INTO "spaces" ("id", "slug", "name", "type", "description", "createdAt", "updatedAt")
VALUES ('code', 'code', '代码空间', 'code', 'Code Space：仓库、Diff 与 Review 工作区', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Seed：现有用户自动成为 Code Space member（同 Work 策略，owner 级以保持组织一致）
INSERT INTO "memberships" ("id", "spaceId", "userId", "role", "createdAt")
SELECT gen_random_uuid()::text, 'code', u."id", 'owner', CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("spaceId", "userId") DO NOTHING;

-- CreateIndex
CREATE INDEX "code_repositories_spaceId_idx" ON "code_repositories"("spaceId");

-- CreateIndex
CREATE INDEX "code_diffs_repositoryId_idx" ON "code_diffs"("repositoryId");

-- CreateIndex
CREATE INDEX "code_reviews_diffId_idx" ON "code_reviews"("diffId");

-- AddForeignKey
ALTER TABLE "code_repositories" ADD CONSTRAINT "code_repositories_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_diffs" ADD CONSTRAINT "code_diffs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "code_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_diffId_fkey" FOREIGN KEY ("diffId") REFERENCES "code_diffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
