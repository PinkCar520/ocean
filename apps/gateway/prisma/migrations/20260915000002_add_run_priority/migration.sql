-- 运行优先级三档（Phase 4 第 6 项，借鉴 K3）：critical 立即调度，interactive 正常，background 闲时
ALTER TABLE "agent_runs" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'interactive';

-- outbox 取件排序：priorityRank 0=critical, 1=interactive, 2=background
ALTER TABLE "outbox_events" ADD COLUMN "priorityRank" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "outbox_events_status_priorityRank_availableAt_idx" ON "outbox_events"("status", "priorityRank", "availableAt");
