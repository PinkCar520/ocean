CREATE TABLE "run_schedules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "run_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "run_schedules_active_nextRunAt_idx" ON "run_schedules"("active", "nextRunAt");
CREATE INDEX "run_schedules_userId_createdAt_idx" ON "run_schedules"("userId", "createdAt");
ALTER TABLE "run_schedules" ADD CONSTRAINT "run_schedules_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "run_schedules" ADD CONSTRAINT "run_schedules_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
