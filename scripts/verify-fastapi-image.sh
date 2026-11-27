#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -t ocean-fastapi-ci apps/fastapi-backend
docker run --rm --entrypoint python ocean-fastapi-ci -m unittest discover -s tests -v
