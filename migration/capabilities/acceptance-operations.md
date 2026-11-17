# Acceptance and maintenance

## Live model acceptance

Run from the repository root using the configured provider credentials:

```sh
pnpm --filter gateway exec jest --config ./test/jest-e2e.json --testRegex live-provider.live-spec.ts --runInBand
```

Set `OCEAN_LIVE_PROVIDER` to a configured provider/model to override the default.
This test always makes a real network request and fails on provider errors.
It is deliberately outside the default E2E filename pattern; it never turns
missing credentials or provider failure into a skipped/pass result.

On 2026-11-16 the default provider was DeepSeek. Both the default request and
the explicit DeepSeek override therefore targeted the same provider and returned
`Insufficient Balance`. No second distinct provider was verified. These are failed live acceptances, not successful
provider verification. The isolated PostgreSQL/Worker acceptance remains
separate and uses the production SimModelGateway.

## Approval maintenance

RunModule schedules approval maintenance on startup and every minute.
Expired approved session grants become `expired`. Old `expired` and
`superseded` records are deleted after `OCEAN_APPROVAL_RETENTION_DAYS`
(default 30, accepted range 1–3650). Current pending and unexpired approved
records are retained. Concurrent maintenance passes are idempotent.

CLI approval creation and grant lookup carry the local policy fingerprint.
A policy change while awaiting approval rejects the pending local invocation;
a later invocation obtains fresh approval. Fingerprints must match exactly
for external session-grant reuse.

## Tool journals

`OCEAN_TOOL_JOURNAL_RETENTION_MS` configures retention for terminal CLI tool
journals (default seven days, nonnegative safe integer). Unknown journals are
never pruned by this policy.

`SessionStore.reconcileToolCall` accepts a trusted query-only provider adapter.
The adapter must return the exact session/call/tool/input-digest identity and
a proven terminal result; unknown responses leave the journal unchanged.
No tool is re-executed by reconciliation. Executing/prepared entries are not
reconciled while they may still have an active owner. No builtin adapter for
an external provider is supplied yet.

The journal crash contract sends an actual SIGKILL after an fsynced side effect,
then verifies a fresh process refuses replay. This proves process-crash behavior;
it does not prove power-loss ordering or storage-controller durability. Actual
power-loss acceptance requires an isolated VM or fault-injecting filesystem,
which is not available in this environment.
