from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

REQUIRED = {"id", "suite", "input", "expected", "risk", "source", "tags"}
SUITES = {"context", "agent", "tool-use", "safety"}


def validate_case(case: dict, line_number: int) -> list[str]:
    errors = []
    missing = REQUIRED - set(case)
    if missing:
        errors.append(f"line {line_number}: missing {sorted(missing)}")
    if case.get("suite") not in SUITES:
        errors.append(f"line {line_number}: invalid suite {case.get('suite')!r}")
    if not isinstance(case.get("expected"), dict) or not case.get("expected"):
        errors.append(f"line {line_number}: expected must be a non-empty object")
    if not isinstance(case.get("tags"), list):
        errors.append(f"line {line_number}: tags must be an array")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and summarize OLO eval datasets")
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--minimum", type=int, default=50)
    args = parser.parse_args()

    cases = []
    errors = []
    seen = set()
    with args.dataset.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                case = json.loads(line)
            except json.JSONDecodeError as error:
                errors.append(f"line {line_number}: invalid JSON: {error}")
                continue
            errors.extend(validate_case(case, line_number))
            if case.get("id") in seen:
                errors.append(f"line {line_number}: duplicate id {case.get('id')}")
            seen.add(case.get("id"))
            cases.append(case)

    if len(cases) < args.minimum:
        errors.append(f"dataset has {len(cases)} cases; minimum is {args.minimum}")
    suites = Counter(case.get("suite") for case in cases)
    missing_suites = SUITES - set(suites)
    if missing_suites:
        errors.append(f"dataset lacks suites: {sorted(missing_suites)}")

    report = {"dataset": str(args.dataset), "cases": len(cases), "suites": suites, "errors": errors}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
