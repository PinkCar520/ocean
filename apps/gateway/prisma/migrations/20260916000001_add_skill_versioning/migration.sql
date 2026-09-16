-- Skill 版本化：SkillVersion 加语义版本快照与变更说明；SkillInstallation 加安装版本快照
ALTER TABLE "skill_versions" ADD COLUMN "version" TEXT;
ALTER TABLE "skill_versions" ADD COLUMN "changelog" TEXT;
ALTER TABLE "skill_installations" ADD COLUMN "version" TEXT;
