-- Phase 5 收口：spaceId 转非空（Document 间接归属落地）+ FK 语义对齐 Restrict + 组合索引
-- 顺序：加列（可空）→ 回填 → 转非空 → FK 重建 → 索引

-- 1) documents 加可空列
ALTER TABLE "documents" ADD COLUMN     "spaceId" TEXT;

-- 2) 回填：归属 project 的 spaceId，无 project 归属默认 work
UPDATE "documents" d SET "spaceId" = COALESCE(
  (SELECT kp."spaceId" FROM "knowledge_projects" kp WHERE kp."id" = d."projectId"),
  'work'
) WHERE d."spaceId" IS NULL;

-- 3) 全表转非空
ALTER TABLE "documents" ALTER COLUMN "spaceId" SET NOT NULL;
ALTER TABLE "knowledge_projects" ALTER COLUMN "spaceId" SET NOT NULL;
ALTER TABLE "mcp_servers" ALTER COLUMN "spaceId" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "spaceId" SET NOT NULL;
ALTER TABLE "skill_installations" ALTER COLUMN "spaceId" SET NOT NULL;

-- 4) FK 语义对齐：SetNull 与 NOT NULL 冲突，统一 Restrict（Space 删除需显式迁移数据）
ALTER TABLE "knowledge_projects" DROP CONSTRAINT "knowledge_projects_spaceId_fkey";
ALTER TABLE "mcp_servers" DROP CONSTRAINT "mcp_servers_spaceId_fkey";
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_spaceId_fkey";
ALTER TABLE "skill_installations" DROP CONSTRAINT "skill_installations_spaceId_fkey";

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_projects" ADD CONSTRAINT "knowledge_projects_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skill_installations" ADD CONSTRAINT "skill_installations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) 组合索引（查询热点：按用户 + Space 列会话/安装；按 Space 列文档）
CREATE INDEX "documents_spaceId_idx" ON "documents"("spaceId");
CREATE INDEX "sessions_userId_spaceId_idx" ON "sessions"("userId", "spaceId");
CREATE INDEX "skill_installations_userId_spaceId_idx" ON "skill_installations"("userId", "spaceId");
