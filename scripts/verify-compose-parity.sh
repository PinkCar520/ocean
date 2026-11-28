#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export DATABASE_URL=postgresql://ocean:test@postgres:5432/ocean
export POSTGRES_PASSWORD=test JWT_SECRET=test
export OCEAN_IMAGE_PREFIX=ccr.ccs.tencentyun.com/ocean-test
for s in GATEWAY WEB INFERENCE POSTGRES REDIS; do
  export "OCEAN_${s}_DIGEST=sha256:$(printf '%064d' 0)"
done
docker compose --env-file /dev/null -f docker-compose.yml config --no-env-resolution --format json > "$tmp/dev.json"
docker compose --env-file /dev/null -f docker-compose.prod.yml config --no-env-resolution --format json > "$tmp/prod.json"
jq -e '.services | keys == ["gateway","inference","migrate","postgres","redis","web","worker"]' "$tmp/dev.json" "$tmp/prod.json"
diff <(jq -S '.services | map_values(.depends_on // {} | map_values(.condition))' "$tmp/dev.json") <(jq -S '.services | map_values(.depends_on // {} | map_values(.condition))' "$tmp/prod.json")
for f in "$tmp/dev.json" "$tmp/prod.json"; do
  jq -e '.services | (.gateway.image == .worker.image and .worker.image == .migrate.image) and (.gateway.environment.OCEAN_INFERENCE_URL == "http://inference:8000") and (.worker.environment.OCEAN_INFERENCE_URL == "http://inference:8000")' "$f"
done
jq -e '.services | [.["inference"],.postgres,.redis] | all((.ports // []) | length == 0)' "$tmp/prod.json"
jq -e '.services | [.[] | .image] | unique | length == 5' "$tmp/prod.json"
jq -e '.services | [.[] | .image] | all(startswith("ccr.ccs.tencentyun.com/ocean-test/") and test("@sha256:[a-f0-9]{64}$"))' "$tmp/prod.json"
for service in postgres redis; do
  image=$(jq -er --arg s "$service" '.services[$s].image' "$tmp/dev.json")
  grep -Fq "SOURCE: $image" .github/workflows/deploy.yml
done
