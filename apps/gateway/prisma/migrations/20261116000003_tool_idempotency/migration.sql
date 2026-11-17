ALTER TABLE "run_steps" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "run_steps_runId_idempotencyKey_key"
  ON "run_steps"("runId", "idempotencyKey");
