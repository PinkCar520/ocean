import contextlib
import csv
import hashlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('verify-claude-file-audit.py')
spec = importlib.util.spec_from_file_location('verify_claude_file_audit', SCRIPT)
assert spec and spec.loader
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditValidationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.source = root / 'src'
        self.source.mkdir()
        (self.source / 'source.ts').write_text('source', encoding='utf-8')
        self.ledger = root / 'ledger.tsv'
        self.row = {
            'source_path': 'source.ts',
            'source_sha256': hashlib.sha256(b'source').hexdigest(),
            'review_state': 'unreviewed',
            **{field: 'documented' for field in audit.REQUIRED_REVIEW},
        }

    def run_audit(self, rows, *arguments):
        with self.ledger.open('w', encoding='utf-8', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(self.row), delimiter='\t')
            writer.writeheader()
            writer.writerows(rows)
        with patch.object(audit, 'SOURCE', self.source), patch.object(audit, 'LEDGER', self.ledger), patch.object(sys, 'argv', ['audit', *arguments]), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return audit.main()

    def test_incomplete_ledger_is_allowed_only_without_completion_gate(self):
        self.assertEqual(self.run_audit([self.row]), 0)
        self.assertEqual(self.run_audit([self.row], '--require-complete'), 1)

    def test_reviewed_requires_all_evidence_fields(self):
        row = {**self.row, 'review_state': 'reviewed', 'evidence': ''}
        self.assertEqual(self.run_audit([row]), 1)
        row['evidence'] = 'source.ts:1; target.ts:1'
        self.assertEqual(self.run_audit([row], '--require-complete'), 0)

    def test_source_change_invalidates_review(self):
        (self.source / 'source.ts').write_text('changed', encoding='utf-8')
        self.assertEqual(self.run_audit([{**self.row, 'review_state': 'reviewed'}]), 1)

    def test_missing_and_duplicate_entries_fail(self):
        self.assertEqual(self.run_audit([]), 1)
        self.assertEqual(self.run_audit([self.row, self.row]), 1)


if __name__ == '__main__':
    unittest.main()
