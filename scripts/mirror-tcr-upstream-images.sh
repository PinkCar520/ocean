#!/usr/bin/env bash
set -euo pipefail

: "${PREFIX:?PREFIX is required}"
: "${TAG:?TAG is required}"
: "${POSTGRES_SOURCE:?POSTGRES_SOURCE is required}"
: "${REDIS_SOURCE:?REDIS_SOURCE is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

inspect_digest() {
  timeout --kill-after=5s 45s docker buildx imagetools inspect "$1" --format '{{json .Manifest}}' |
    jq -er '.digest'
}

copy_with_retry() {
  local source="$1" target="$2" attempt
  for attempt in 1 2 3; do
    printf 'Copy attempt %s/3: %s -> %s\n' "$attempt" "$source" "$target"
    if timeout --kill-after=15s 300s docker buildx imagetools create --prefer-index=false --tag "$target" "$source"; then
      return 0
    fi
    printf 'Copy attempt %s failed or timed out\n' "$attempt" >&2
    if [[ "$attempt" != 3 ]]; then sleep "$((attempt * 10))"; fi
  done
  return 1
}

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
  if actual_digest="$(inspect_digest "$target")" && [[ "$actual_digest" == "$expected_digest" ]]; then
    printf 'Revision tag already verified: %s\n' "$target"
  else
    cached_ref="$PREFIX/ocean-$service@$expected_digest"
    if cached_digest="$(inspect_digest "$cached_ref")" && [[ "$cached_digest" == "$expected_digest" ]]; then
      printf 'Reusing existing registry digest: %s\n' "$cached_ref"
      copy_with_retry "$cached_ref" "$target"
    else
      copy_with_retry "$source_ref" "$target"
    fi
    actual_digest="$(inspect_digest "$target")"
  fi

  if [[ "$actual_digest" != "$expected_digest" ]]; then
    printf 'Digest mismatch for %s: expected %s, got %s\n' "$service" "$expected_digest" "$actual_digest" >&2
    exit 1
  fi

  printf '%s_digest=%s\n' "$service" "$actual_digest" >> "$GITHUB_OUTPUT"
  printf 'Verified %s digest: %s\n' "$service" "$actual_digest"
done
