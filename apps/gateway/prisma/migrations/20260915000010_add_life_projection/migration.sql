-- Phase 6 6e：Life 投影（个人记忆）
-- CreateTable
CREATE TABLE "life_memories" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" TEXT NOT NULL DEFAULT 'note',
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "life_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "life_memories_spaceId_idx" ON "life_memories"("spaceId");

-- AddForeignKey
ALTER TABLE "life_memories" ADD CONSTRAINT "life_memories_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

