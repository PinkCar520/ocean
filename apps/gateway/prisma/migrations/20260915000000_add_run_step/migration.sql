-- RunStep：Run 的步骤化执行记录（Phase 4 第 2 项）
CREATE TABLE "run_steps" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'model_call',
    "status" TEXT NOT NULL DEFAULT 'started',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "checkpoint" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "run_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "run_steps_runId_seq_key" ON "run_steps"("runId", "seq");
CREATE INDEX "run_steps_runId_status_idx" ON "run_steps"("runId", "status");

ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
