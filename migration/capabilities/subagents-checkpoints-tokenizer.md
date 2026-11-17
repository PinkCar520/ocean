# Gateway subagents, checkpoints and token accounting

## Durable subagents

Authenticated POST `/api/runs/:parentId/subagents` accepts
`{toolCallId, agent, prompt}`. The parent must be idle. Child user/Space/priority
are inherited from the authorized parent; clients cannot choose a different
principal or workspace. A parent/call unique constraint prevents duplicate
children; different input under the same identity is rejected. Limits are eight
children per parent and three nested parent links.

The same transaction creates the child Run, parent `subagent` RunStep, child
Outbox request and events. The parent waits for input and cannot resume while
children are unsettled. Workers reconcile children before polling: results
complete parent steps, successful children requeue the parent, failed children
fail it, and terminal parents cancel unfinished children. Agent names currently
label persisted child work; they do not select a separate agent policy/template.
CLI `delegate_task` still uses its local persistence and is not routed to this
Gateway endpoint automatically.

The PostgreSQL E2E kills a separate Worker during a child model step, then starts
another Worker. It verifies the original child step is reused and the parent
step/result and parent Run converge after recovery.

## Gateway checkpoints

`OCEAN_GATEWAY_WORKSPACES` is an administrator-controlled JSON object mapping
Space IDs to filesystem roots. Without a configured root, checkpoint tools deny
access. `checkpoint.write` and `checkpoint.rollback` require normal ToolExecutor
approval. Context identity comes from the persisted Run, and file operations use
the same shared Checkpoints implementation as the CLI.

Node-only filesystem code is exposed through `@ocean/core/checkpoints`,
`@ocean/core/file-system`, `@ocean/core/security`, and
`@ocean/core/notebook-snapshots`. CLI modules re-export these entry points.

Rollback refuses an externally changed target. Creation uses atomic no-clobber
link installation. Existing-file replacement still has a comparison-to-rename
window against arbitrary non-cooperating writers. The cooperative lock and
pre-commit checks do not turn POSIX rename into compare-and-swap; that gap is
not claimed solved.

## Permission syntax and IDs

Bash commands are parsed into an AST. Auto-allow classification accepts only
one literal command with approved arguments and lexical in-workspace paths.
Assignments, redirections, expansions, compound commands, unsupported syntax
and traversal remain non-read-only. This is conservative AST classification,
not full semantic equivalence for arbitrary Bash programs or symlinked paths.

Normalized rule IDs distinguish repeated rules across policy layers. A used-ID
set also handles literal patterns that resemble generated ordinal suffixes.
IDs remain tied to policy ordering/content; they are not permanent editor UUIDs.

## Token accounting

`OCEAN_TOKEN_ENCODING` selects `o200k_base` (default) or `cl100k_base`.
A WASM BPE tokenizer counts serialized context, replacing byte division.
Counts are exact for the selected encoding and serialized input, not necessarily
for every provider's hidden chat template or proprietary tokenizer.

ModelGateway preserves reported input/output/total and optional cache-read/write
usage. RunRunner persists these counters on model steps. Missing counters are
not invented. The explicit live-provider acceptance now also asserts positive
provider-reported input/output/total usage.

On 2026-11-17 the configured provider (`deepseek`, model `deepseek-flash`) passed
that real network acceptance. This supersedes the earlier balance failures for
the current environment, without changing the historical failed results.
