# Engineering Harness

Development status is tracked in `manifest.json`. Independent acceptance is separate from implementation and CI.

## Source intelligence (EH-01)

Run `pnpm audit:test` and `pnpm audit:source --output /tmp/source-intelligence.json` from an installed checkout.
The report inventories Git-tracked JS/TS under apps, packages, agents, scripts and deploy; it excludes reference source and documentation.
It uses TypeScript's configured module resolution and export symbol checker, includes static imports, reexports, import types, literal dynamic imports and require calls, and records unresolved and nonliteral references explicitly.
Overlapping owning compiler configurations are analyzed separately, and cross-file identifier bindings include declaration and usage locations. These bindings include import declarations and type references; they are not a runtime call graph.
It records the checked-out commit, tracked dirty status, workspace ownership, configuration diagnostics and coverage. Missing tracked sources fail the command.
CI generates the report as an artifact; the fixture tests exercise aliases, reexports, cross-workspace edges, unknown references, missing files and deterministic ordering.

Package manifest entry points and conditional exports are inventoried. Where compiled workspace artifacts are absent, explicit rootDir/outDir projections provide source candidates; projected and ambiguous edges are not treated as compiler-resolved. Export restrictions are respected by the projection. Pattern declarations are reported separately.

Runtime roots declared in `scripts/engineering/runtime-entries.json` record their configuration evidence. Missing tracked paths fail the command. Next.js route conventions are inventoried as candidates, not proof of runtime reachability. Other languages and reference sources are listed explicitly as unanalyzed. Each analyzed file has a content hash for evidence comparison.

The report is evidence, not a dead-code verdict. Generated package declarations, runtime plugins, CSS imports, assets, framework conventions, nonliteral imports and Swift require further analysis. An unresolved edge does not imply unused code. The current stage does not enforce dependency boundaries or claim full semantic usage analysis. Run after dependencies are installed; build workspace packages when analyzing generated declaration resolution.

No business code is changed.

## Integrated harness

The root [AGENTS.md](../../AGENTS.md) defines the execution and handoff contract. The [module ledger](manifest.json) is the only development status record. Module and integration CI evidence is tied to an exact SHA; no implementation PR is independently accepted merely because its tests pass.

See [static analysis](toolchain.md), [safe transformations](codemod.md), and [verification](verification.md). The existing reusable quality workflow now calls analysis, codemod, and workspace verification as jobs, so deploy's existing dependency on the quality workflow covers those jobs as well. Scheduled maintenance reuses analysis and validates the ledger and engineering documentation; it never modifies product code.

The integration combines module work from PRs #99–#102. These are source provenance, not current independent acceptance. All modules remain PARTIAL. Branch protection settings and the packages/ui full trial are outstanding. Configuration rules and scope limitations are explicit rather than hidden by a success claim.
