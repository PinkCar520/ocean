-- 前置：skill_versions 表缺少创建迁移（早期 db push 建表，未纳入迁移历史）。
-- 此处补 CREATE TABLE IF NOT EXISTS，使全新库可从零跑通；已应用的库会跳过。
CREATE TABLE IF NOT EXISTS "skill_versions" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "skill_versions_skillId_idx" ON "skill_versions"("skillId");
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Skill 版本化：SkillVersion 加语义版本快照与变更说明；SkillInstallation 加安装版本快照
ALTER TABLE "skill_versions" ADD COLUMN "version" TEXT;
ALTER TABLE "skill_versions" ADD COLUMN "changelog" TEXT;
ALTER TABLE "skill_installations" ADD COLUMN "version" TEXT;
