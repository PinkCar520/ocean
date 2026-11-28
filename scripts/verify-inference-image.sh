#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -t ocean-inference-ci services/inference
docker run --rm --entrypoint python ocean-inference-ci -m unittest discover -s tests -v
