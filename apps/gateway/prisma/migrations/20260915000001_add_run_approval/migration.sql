-- RunApproval：Run 维度审批记录（Phase 4 第 5 项：审批/交互续跑）
CREATE TABLE "run_approvals" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "run_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "run_approvals_runId_status_idx" ON "run_approvals"("runId", "status");

ALTER TABLE "run_approvals" ADD CONSTRAINT "run_approvals_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
