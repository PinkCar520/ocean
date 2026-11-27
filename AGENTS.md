# Ocean engineering rules

## Execution
Use the actual repository, not completion claims in reports. Read the current commit and the relevant manifest before changes. Keep scope within the authorized task. Reuse existing tooling and avoid duplicate infrastructure. Use module-sized coherent changes, automated tests and reviewed PRs; do not bypass failing checks.

## Engineering Harness
The single development ledger is `docs/engineering-harness/manifest.json`. Status is evidence-based; do not self-assign VERIFIED. Keep unresolved risks and test limitations explicit. Independent reviewers must identify the exact commit and actual execution evidence. A new commit requires revalidation. A clean report is not proof of behavior or complete reference coverage.

Use `pnpm audit:source`, `pnpm audit:health`, `pnpm audit:architecture`, `pnpm audit:codemod`, `pnpm audit:verify`, and `pnpm audit:governance` with their documented arguments. Never delete a source merely because a scanner calls it unused. Confirm public exports, dynamic/framework entry points, cross-host consumers and tests. Preview AST transforms; review diffs; run relevant verification.

## Recovery
On handoff or context reset, identify the exact branch, commit and PR. Read the ledger, actual diffs, failing check logs, and remaining gaps. Continue the next unclosed acceptance condition; do not repeat already evidenced work or replace implementation with a report. Do not commit generated analysis artifacts. No direct changes to main.

Product-specific AGENTS.md files may add local requirements. They cannot waive independent acceptance or the repository's quality checks.
