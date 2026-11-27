# EH-04: safe AST codemod

This initial transformation performs module-specifier normalization only. It uses the existing TypeScript compiler and resolves both specifiers in every explicitly provided compiler configuration. It rejects different implementation targets, unresolved modules, untracked sources, overlapping rules and stale or tampered previews.

Example rules file (illustrative; select real files and aliases before execution):

```json
[{"file":"apps/web/src/example.ts","from":"./target","to":"@target","configs":["apps/web/tsconfig.json"]}]
```

```sh
node scripts/engineering/codemod.mjs plan rules.json /tmp/ocean-plan.json
node scripts/engineering/codemod.mjs apply /tmp/ocean-plan.json
```

Preview never changes source and cannot overwrite an existing plan. Apply requires a clean tracked checkout and the exact planned commit, recomputes the plan and verifies hashes, and attempts rollback on write failure. It rewrites literal imports, reexports, import types and dynamic imports, not comments, arbitrary string values or potentially shadowed require calls. It does not delete files.

The rule must cover every compiler context found by the source-intelligence analyzer, including consuming hosts. Both import and require resolution modes must preserve one tracked module identity; unsupported or unresolved old edges are rejected. This does not prove runtime-loader behavior, unobserved compiler contexts, or behavioral equivalence of distinct components. Those require source-intelligence integration, cross-host tests and independent review before UI consolidation. The older AI SDK migration script is not replaced by this narrow tool. No product code is changed.

Status: PARTIAL, pending CI and independent acceptance.
