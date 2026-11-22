-- Safely promote historical RunStep JSON keys to the unique indexed column.
-- Duplicate historical keys cannot be disambiguated: keep them NULL so
-- ToolExecutor's conservative JSON fallback continues to detect conflicts.
WITH candidates AS (
  SELECT "id", "runId", "input"->>'idempotencyKey' AS candidate_key,
    COUNT(*) OVER (
      PARTITION BY "runId", "input"->>'idempotencyKey'
    ) AS occurrences
  FROM "run_steps"
  WHERE "kind" = 'tool_call'
    AND "idempotencyKey" IS NULL
    AND jsonb_typeof("input") = 'object'
    AND NULLIF("input"->>'idempotencyKey', '') IS NOT NULL
),
eligible AS (
  SELECT c."id", c.candidate_key
  FROM candidates c
  WHERE c.occurrences = 1
    AND NOT EXISTS (
      SELECT 1 FROM "run_steps" existing
      WHERE existing."runId" = c."runId"
        AND existing."idempotencyKey" = c.candidate_key
    )
)
UPDATE "run_steps" step
SET "idempotencyKey" = eligible.candidate_key
FROM eligible
WHERE step."id" = eligible."id";
