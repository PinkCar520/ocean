ALTER TABLE "sessions" ADD COLUMN "favorited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "projectId" TEXT;

CREATE INDEX "sessions_projectId_idx" ON "sessions"("projectId");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "knowledge_projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
