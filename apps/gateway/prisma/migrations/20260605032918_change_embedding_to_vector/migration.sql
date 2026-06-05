/*
  Warnings:

  - You are about to alter the column `embedding` on the `document_chunks` table. The data in that column could be lost. The data in that column will be cast from `JsonB` to `Unsupported("vector(1536)")`.

*/
-- AlterTable
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "document_chunks" ADD COLUMN     "tsv" tsvector,
ALTER COLUMN "embedding" SET DATA TYPE vector(1536) USING "embedding"::text::vector;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "customInstructions" TEXT;

-- CreateTable
CREATE TABLE "knowledge_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "color" TEXT,
    "userId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_projects_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "knowledge_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
