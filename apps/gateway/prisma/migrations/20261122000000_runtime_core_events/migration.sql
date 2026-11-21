CREATE TABLE "runtime_core_events" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "runtime_core_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "runtime_core_events_runId_sequence_key" ON "runtime_core_events"("runId", "sequence");
CREATE INDEX "runtime_core_events_runId_createdAt_idx" ON "runtime_core_events"("runId", "createdAt");
ALTER TABLE "runtime_core_events"
  ADD CONSTRAINT "runtime_core_events_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
