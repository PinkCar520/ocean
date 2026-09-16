-- RunApproval 松绑 Run：支持 CLI 本地执行的外部审批（无 Run），审批归属用户。
ALTER TABLE "run_approvals" ALTER COLUMN "runId" DROP NOT NULL;
ALTER TABLE "run_approvals" ALTER COLUMN "toolCallId" DROP NOT NULL;
ALTER TABLE "run_approvals" ADD COLUMN "userId" TEXT;
ALTER TABLE "run_approvals" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "run_approvals" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'run';
-- 回填存量审批的归属用户（Run 内审批 = run.userId）
UPDATE "run_approvals" a SET "userId" = r."userId"
FROM "agent_runs" r WHERE a."runId" = r.id AND a."userId" IS NULL;
CREATE INDEX "run_approvals_userId_status_idx" ON "run_approvals" ("userId", "status");
