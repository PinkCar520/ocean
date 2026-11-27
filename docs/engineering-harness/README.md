# Engineering Harness

Development status is tracked in `manifest.json`. Independent acceptance is separate from implementation and CI.

## Source intelligence (EH-01)

Run `pnpm audit:test` and `pnpm audit:source --output /tmp/source-intelligence.json` from an installed checkout.
The report inventories Git-tracked JS/TS under apps, packages, agents, scripts and deploy; it excludes reference source and documentation.
It uses TypeScript's configured module resolution and export symbol checker, includes static imports, reexports, import types, literal dynamic imports and require calls, and records unresolved and nonliteral references explicitly.
It records the checked-out commit, tracked dirty status, workspace ownership, configuration diagnostics and coverage. Missing tracked sources fail the command.
CI generates the report as an artifact; the fixture tests exercise aliases, reexports, cross-workspace edges, unknown references, missing files and deterministic ordering.

The report is evidence, not a dead-code verdict. Generated package declarations, runtime plugins, CSS imports, assets, framework conventions, nonliteral imports and Swift require further analysis. An unresolved edge does not imply unused code. The current stage does not enforce dependency boundaries or claim full semantic usage analysis. Run after dependencies are installed; build workspace packages when analyzing generated declaration resolution.

No business code is changed.
