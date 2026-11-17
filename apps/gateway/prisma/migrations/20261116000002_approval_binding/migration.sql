ALTER TABLE "run_approvals"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'once',
  ADD COLUMN "policyVersion" TEXT,
  ADD COLUMN "policyRuleId" TEXT,
  ADD COLUMN "argsHash" TEXT;

CREATE INDEX "run_approvals_sessionId_toolName_status_idx"
  ON "run_approvals"("sessionId", "toolName", "status");
