#!/usr/bin/env bash
set -euo pipefail

: "${PREFIX:?PREFIX is required}"
: "${TAG:?TAG is required}"
: "${POSTGRES_SOURCE:?POSTGRES_SOURCE is required}"
: "${REDIS_SOURCE:?REDIS_SOURCE is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

for service in postgres redis; do
  case "$service" in
    postgres) source_ref="$POSTGRES_SOURCE" ;;
    redis) source_ref="$REDIS_SOURCE" ;;
  esac

  expected_digest="${source_ref##*@}"
  if [[ ! "$expected_digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    printf 'Invalid pinned digest for %s: %s\n' "$service" "$expected_digest" >&2
    exit 1
  fi

  target="$PREFIX/ocean-$service:$TAG"
  printf 'Mirroring %s to %s\n' "$source_ref" "$target"
  docker buildx imagetools create --prefer-index=false --tag "$target" "$source_ref"

  actual_digest="$(
    docker buildx imagetools inspect "$target" --format '{{json .Manifest}}' |
      jq -er '.digest'
  )"

  if [[ "$actual_digest" != "$expected_digest" ]]; then
    printf 'Digest mismatch for %s: expected %s, got %s\n' "$service" "$expected_digest" "$actual_digest" >&2
    exit 1
  fi

  printf '%s_digest=%s\n' "$service" "$actual_digest" >> "$GITHUB_OUTPUT"
  printf 'Verified %s digest: %s\n' "$service" "$actual_digest"
done
