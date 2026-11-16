import subprocess
import sys
from pathlib import Path

import yaml
from fastapi.routing import APIRoute
from olo_api.main import app

ROOT = Path(__file__).resolve().parents[3]
# Contracts were promoted to the monorepo root packages/contracts (shared by Ocean and OLO).
MONOREPO_ROOT = Path(__file__).resolve().parents[5]
CONTRACTS = MONOREPO_ROOT / "packages/contracts"


def test_committed_openapi_paths_exist_in_runtime() -> None:
    contract = yaml.safe_load((CONTRACTS / "openapi.yaml").read_text())
    runtime_paths = {
        route.path.replace("{task_id}", "{taskId}")
        .replace("{plan_id}", "{planId}")
        .replace("{body_id}", "{bodyId}")
        .replace("{action_id}", "{actionId}")
        for route in app.routes
        if isinstance(route, APIRoute)
    }
    missing = set(contract["paths"]) - runtime_paths
    assert not missing, f"OpenAPI paths missing from runtime: {sorted(missing)}"


def test_runtime_does_not_publish_undocumented_v1_paths() -> None:
    contract = yaml.safe_load((CONTRACTS / "openapi.yaml").read_text())
    contract_paths = set(contract["paths"])
    runtime_paths = {
        route.path.replace("{task_id}", "{taskId}")
        .replace("{plan_id}", "{planId}")
        .replace("{body_id}", "{bodyId}")
        .replace("{action_id}", "{actionId}")
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/v1")
    }
    undocumented = runtime_paths - contract_paths
    assert not undocumented, f"Runtime v1 paths missing from OpenAPI: {sorted(undocumented)}"


def test_generated_swift_contracts_are_current() -> None:
    subprocess.run(
        [sys.executable, str(CONTRACTS / "generate_swift.py"), "--check"],
        cwd=MONOREPO_ROOT,
        check=True,
    )
