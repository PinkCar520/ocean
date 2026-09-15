-- Phase 5：Space 数据边界（ADR-001）
-- 1) 新增 Space 域模型 + 核心表可空 spaceId（先扩展）
-- 2) 种子默认 Work Space + 成员回填（现有用户 owner）
-- 3) 现有业务数据回填到默认 Work Space
-- 4) 最后加外键（agent_runs.spaceId 引用 spaces）

-- AlterTable
ALTER TABLE "knowledge_projects" ADD COLUMN     "spaceId" TEXT;

-- AlterTable
ALTER TABLE "mcp_servers" ADD COLUMN     "spaceId" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "spaceId" TEXT;

-- AlterTable
ALTER TABLE "skill_installations" ADD COLUMN     "spaceId" TEXT;

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'personal',
    "name" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_sets" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "rules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_grants" (
    "id" TEXT NOT NULL,
    "fromSpaceId" TEXT NOT NULL,
    "toSpaceId" TEXT NOT NULL,
    "scope" JSONB,
    "purpose" TEXT,
    "grantedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces"("slug");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_spaceId_userId_key" ON "memberships"("spaceId", "userId");

-- CreateIndex
CREATE INDEX "identities_userId_idx" ON "identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "policy_sets_spaceId_key_key" ON "policy_sets"("spaceId", "key");

-- CreateIndex
CREATE INDEX "context_grants_fromSpaceId_idx" ON "context_grants"("fromSpaceId");

-- CreateIndex
CREATE INDEX "context_grants_toSpaceId_idx" ON "context_grants"("toSpaceId");

-- CreateIndex
CREATE INDEX "knowledge_projects_spaceId_idx" ON "knowledge_projects"("spaceId");

-- CreateIndex
CREATE INDEX "mcp_servers_spaceId_idx" ON "mcp_servers"("spaceId");

-- CreateIndex
CREATE INDEX "sessions_spaceId_idx" ON "sessions"("spaceId");

-- CreateIndex
CREATE INDEX "skill_installations_spaceId_idx" ON "skill_installations"("spaceId");

-- Seed：默认 Work Space（id 人工可读，客户端默认引用）
INSERT INTO "spaces" ("id", "slug", "name", "type", "description", "createdAt", "updatedAt")
VALUES ('work', 'work', '工作空间', 'work', '默认 Work Space：现有组织数据迁移归属', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Seed：现有用户自动成为 Work Space owner（Life Space 默认本人，后续由产品流程创建）
INSERT INTO "memberships" ("id", "spaceId", "userId", "role", "createdAt")
SELECT gen_random_uuid()::text, 'work', u."id", 'owner', CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("spaceId", "userId") DO NOTHING;

-- 回填：现有业务数据归属默认 Work Space
UPDATE "sessions" SET "spaceId" = 'work' WHERE "spaceId" IS NULL;
UPDATE "knowledge_projects" SET "spaceId" = 'work' WHERE "spaceId" IS NULL;
UPDATE "skill_installations" SET "spaceId" = 'work' WHERE "spaceId" IS NULL;
UPDATE "mcp_servers" SET "spaceId" = 'work' WHERE "spaceId" IS NULL;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_sets" ADD CONSTRAINT "policy_sets_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_grants" ADD CONSTRAINT "context_grants_fromSpaceId_fkey" FOREIGN KEY ("fromSpaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_grants" ADD CONSTRAINT "context_grants_toSpaceId_fkey" FOREIGN KEY ("toSpaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_grants" ADD CONSTRAINT "context_grants_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_projects" ADD CONSTRAINT "knowledge_projects_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_installations" ADD CONSTRAINT "skill_installations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
