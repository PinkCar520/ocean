CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "spaceType" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "run_events" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_runs_userId_idempotencyKey_key" ON "agent_runs"("userId", "idempotencyKey");
CREATE INDEX "agent_runs_userId_status_idx" ON "agent_runs"("userId", "status");
CREATE INDEX "agent_runs_spaceId_createdAt_idx" ON "agent_runs"("spaceId", "createdAt");
CREATE UNIQUE INDEX "run_events_runId_sequence_key" ON "run_events"("runId", "sequence");
CREATE INDEX "run_events_runId_occurredAt_idx" ON "run_events"("runId", "occurredAt");
CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");
CREATE INDEX "outbox_events_lockedAt_idx" ON "outbox_events"("lockedAt");
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "outbox_events"("aggregateType", "aggregateId");

ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
