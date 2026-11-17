#!/usr/bin/env bash
# Isolated acceptance DB; never uses or mutates the caller's DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/../../.."
container="ocean-verify-$$-$(date +%s)"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker run --name "$container" --rm -d -e POSTGRES_PASSWORD=ocean_verify -p 127.0.0.1::5432 pgvector/pgvector:pg16 >/dev/null
ready=0
for attempt in {1..60}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then docker logs "$container"; exit 1; fi
port=$(docker port "$container" 5432/tcp | sed -n 's/^127\.0\.0\.1://p')
export DATABASE_URL="postgresql://postgres:ocean_verify@127.0.0.1:${port}/postgres"
export OCEAN_RUN_OWNERSHIP_PG_TEST=1 OCEAN_TOOL_IDEMPOTENCY_PG_TEST=1 OCEAN_DEVICE_RPC_PG_TEST=1 OCEAN_GATEWAY_E2E_PG_TEST=1
pnpm --filter @ocean/contracts build
pnpm --filter @ocean/core build
pnpm --filter gateway exec prisma migrate deploy
pnpm --filter gateway exec jest --runInBand
pnpm --filter gateway exec jest --config ./test/jest-e2e.json --runInBand
pnpm --filter @ocean/cli exec vitest run
pnpm --filter @ocean/cli exec tsc --noEmit
pnpm --filter gateway exec tsc --noEmit
pnpm --filter gateway exec prisma validate
git diff --check
