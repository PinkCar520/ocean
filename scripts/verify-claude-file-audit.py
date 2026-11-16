#!/usr/bin/env python3
"""Validate the per-file migration ledger without treating classification as review."""

import argparse
import csv
import hashlib
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'ocean/restored-src/src'
LEDGER = ROOT / 'CLAUDE_CODE_FILE_MANIFEST.tsv'
REQUIRED_REVIEW = (
    'entry_behavior', 'inputs_outputs', 'state_side_effects', 'dependencies',
    'Ocean_target', 'ocean_gap', 'migration_plan', 'acceptance', 'evidence',
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--require-complete', action='store_true')
    args = parser.parse_args()
    if not SOURCE.is_dir():
        print(f'Source directory not found: {SOURCE}', file=sys.stderr)
        return 1
    with LEDGER.open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream, delimiter='\t'))
    expected = {p.relative_to(SOURCE).as_posix() for p in SOURCE.rglob('*') if p.is_file()}
    seen: set[str] = set()
    errors: list[str] = []
    reviewed = 0
    for row in rows:
        name = row.get('source_path', '')
        if not name or name in seen:
            errors.append(f'duplicate or empty source path: {name}')
            continue
        seen.add(name)
        if name not in expected:
            errors.append(f'unknown source path: {name}')
            continue
        digest = hashlib.sha256((SOURCE / name).read_bytes()).hexdigest()
        if digest != row.get('source_sha256'):
            errors.append(f'source hash changed: {name}')
        state = row.get('review_state')
        if state == 'reviewed':
            reviewed += 1
            missing = [field for field in REQUIRED_REVIEW if not row.get(field, '').strip()]
            if missing:
                errors.append(f'{name}: missing {", ".join(missing)}')
            if row.get('Ocean_target', '').startswith('Ocean target per product'):
                errors.append(f'{name}: target is still a placeholder')
        elif state != 'unreviewed':
            errors.append(f'{name}: invalid review state {state!r}')
    for name in sorted(expected - seen):
        errors.append(f'missing source path: {name}')
    if args.require_complete and reviewed != len(expected):
        errors.append(f'review incomplete: {reviewed}/{len(expected)}')
    print(f'Source files: {len(expected)}; ledger entries: {len(rows)}; reviewed: {reviewed}; remaining: {len(expected) - reviewed}')
    for error in errors:
        print(error, file=sys.stderr)
    return int(bool(errors))


if __name__ == '__main__':
    raise SystemExit(main())
