CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "roots" JSONB NOT NULL,
    "cwd" JSONB NOT NULL,
    "worktree" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspaces_userId_status_updatedAt_idx" ON "workspaces"("userId", "status", "updatedAt");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD COLUMN "workspaceId" TEXT;

CREATE INDEX "sessions_workspaceId_idx" ON "sessions"("workspaceId");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
