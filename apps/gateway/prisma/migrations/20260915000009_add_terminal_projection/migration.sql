-- Phase 6 6c 尾项：Code 终端投影（会话/命令历史）
-- CreateTable
CREATE TABLE "terminal_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cwd" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "repositoryId" TEXT,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_commands" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "exitCode" INTEGER,
    "durationMs" INTEGER,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminal_sessions_spaceId_idx" ON "terminal_sessions"("spaceId");

-- CreateIndex
CREATE INDEX "terminal_commands_sessionId_idx" ON "terminal_commands"("sessionId");

-- CreateIndex
CREATE INDEX "terminal_commands_spaceId_idx" ON "terminal_commands"("spaceId");

-- AddForeignKey
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "code_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_commands" ADD CONSTRAINT "terminal_commands_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "terminal_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_commands" ADD CONSTRAINT "terminal_commands_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

