-- RunArtifact：Run 产物引用（Phase 4 第 8 项，借鉴 K6：大产物不入 PG）
CREATE TABLE "run_artifacts" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "run_artifacts_storageKey_key" ON "run_artifacts"("storageKey");
CREATE INDEX "run_artifacts_runId_idx" ON "run_artifacts"("runId");

ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
