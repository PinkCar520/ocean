CREATE TABLE "login_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "login_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "login_sessions_userId_expiresAt_idx" ON "login_sessions"("userId", "expiresAt");
