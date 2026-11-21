CREATE TABLE "public_conversation_shares" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "public_conversation_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_conversation_shares_sessionId_key" ON "public_conversation_shares"("sessionId");
ALTER TABLE "public_conversation_shares" ADD CONSTRAINT "public_conversation_shares_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
