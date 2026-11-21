CREATE TABLE "conversation_shares" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "conversation_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_shares_sessionId_recipientId_key" ON "conversation_shares"("sessionId", "recipientId");
CREATE INDEX "conversation_shares_recipientId_idx" ON "conversation_shares"("recipientId");
ALTER TABLE "conversation_shares" ADD CONSTRAINT "conversation_shares_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_shares" ADD CONSTRAINT "conversation_shares_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
