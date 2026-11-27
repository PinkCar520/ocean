# EH-02 / EH-03 analysis toolchain

The pinned Knip, jscpd and dependency-cruiser versions are installed by the existing frozen pnpm lockfile.

- `pnpm audit:health [output-directory]`: collect JSON dead-code candidates, duplicate fragments and per-compiler-context dependency graphs.
- `pnpm audit:dead`: report Knip candidates without treating existing findings as a build failure.
- `pnpm audit:duplicates`: report token clones; no arbitrary repository-wide threshold.
- `pnpm audit:graph`: collect the graph and architecture violations for each listed TS workspace.
- `pnpm audit:tools:test`: execute a negative/positive architecture fixture against the installed tool.

Analysis failures, malformed reports and empty graphs fail CI. Existing findings are recorded rather than silently ignored or automatically deleted. Architecture rules are executable but the repository-wide baseline/delta gate is not yet implemented. The independent workflow is not yet a required branch-protection check. Public exports, runtime entry points and unresolved references must be validated before any deletion. Generated sources and unsupported languages are not a proof of absence.

Initial rules: shared Core may not depend on apps; contracts may not depend on runtime implementations. The graph contexts are explicitly scoped to TS workspaces with source directories. Swift and non-code assets remain separate work.

Status: EH-02 and EH-03 partial, pending actual execution and independent acceptance.
