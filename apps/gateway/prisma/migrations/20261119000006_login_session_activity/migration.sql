ALTER TABLE "login_sessions"
    ADD COLUMN "location" TEXT,
    ADD COLUMN "lastActiveAt" TIMESTAMP(3);

UPDATE "login_sessions" SET "lastActiveAt" = "createdAt";

ALTER TABLE "login_sessions"
    ALTER COLUMN "lastActiveAt" SET NOT NULL,
    ALTER COLUMN "lastActiveAt" SET DEFAULT CURRENT_TIMESTAMP;
