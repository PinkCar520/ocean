-- Phase 3 尾项：清除旧 Session.activeJobId / lastCheckpoint
-- Run Engine 接管后由 agent_runs/run_events 承担，字段已无任何代码引用。
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "activeJobId";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "lastCheckpoint";
