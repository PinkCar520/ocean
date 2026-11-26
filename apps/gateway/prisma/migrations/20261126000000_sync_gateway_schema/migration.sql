BEGIN;

ALTER TABLE "skill_versions" ADD COLUMN "content" TEXT;

ALTER TABLE "skills"
    ADD COLUMN "embedding" vector(1536),
    ADD COLUMN "triggerKws" TEXT[],
    ADD COLUMN "userId" TEXT;

CREATE TABLE "skill_trigger_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "triggeredIds" TEXT[],
    "injectedTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_trigger_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_configs" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "skill_trigger_logs_sessionId_idx" ON "skill_trigger_logs"("sessionId");

ALTER TABLE "run_approvals"
    ADD CONSTRAINT "run_approvals_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "documents_spaceId_idx";
DROP INDEX "sessions_userId_spaceId_idx";
DROP INDEX "skill_installations_userId_spaceId_idx";

COMMIT;
