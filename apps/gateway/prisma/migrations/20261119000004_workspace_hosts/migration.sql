CREATE TABLE "workspace_hosts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_hosts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_hosts_hostId_key" ON "workspace_hosts"("hostId");
CREATE INDEX "workspace_hosts_userId_revokedAt_idx" ON "workspace_hosts"("userId", "revokedAt");

ALTER TABLE "workspace_hosts"
ADD CONSTRAINT "workspace_hosts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
