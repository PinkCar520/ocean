ALTER TABLE "agent_runs" ADD COLUMN "parentRunId" TEXT, ADD COLUMN "parentToolCallId" TEXT;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "agent_runs_parentRunId_parentToolCallId_key" ON "agent_runs"("parentRunId", "parentToolCallId");
