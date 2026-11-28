#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -t ocean-compute-ci services/compute
docker run --rm --entrypoint python ocean-compute-ci -m unittest discover -s tests -v
