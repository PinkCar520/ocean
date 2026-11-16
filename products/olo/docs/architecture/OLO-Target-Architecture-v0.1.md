# OLO target architecture v0.1

Status: implementation candidate; not an approved product-baseline change
Date: 2026-09-11
Applies to: the next 90 days of OLO engineering and portfolio development

## 1. Purpose

This document turns OLO from a single Apple-platform prototype into an
implementation-ready, production-shaped AI product system. It is intended to
prove the capabilities expected of an AI Product / Agent Engineer:

- context modeling and provenance;
- agent lifecycle and recovery;
- constrained model use;
- permission-gated tool execution;
- verified action receipts;
- evaluation, observability, privacy, and device integration.

It does not approve a new Product PRD, authorize new hardware, or claim that
future bodies and integrations already exist. Product authority remains in the
[document index](../README.md).

## 2. Architecture decisions

### 2.1 Build a modular system, deploy a modular monolith first

The repository exposes `context-engine`, `agent-runtime`, and `tool-gateway` as
separate code boundaries. During v0.1 they run in one backend process and one
database. They may be split into independent services only after measurements
show a scaling, reliability, security, or ownership need.

This preserves system-design evidence without adding premature service
discovery, distributed transactions, queues, or operational overhead.

### 2.2 Keep Apple-local execution on the Apple device

EventKit, AlarmKit, App Intents, local notifications, speech, and Foundation
Models remain behind Swift adapters. The backend cannot pretend to execute an
Apple capability that requires the user's device or system permission.

The device advertises a capability descriptor. The runtime may propose a tool
call, but the device-side policy and system authorization are checked again
immediately before execution. Only a read-back or provider receipt can produce
`verified`.

### 2.3 Treat model output as a proposal

Models may extract Context, classify Intent, propose a Plan, and prepare typed
tool arguments. They cannot:

- register a capability;
- grant or widen permission;
- mark an action verified;
- write high-impact Memory without deterministic policy;
- execute a provider or device API directly.

All model output is parsed into versioned domain schemas and validated before it
crosses a policy or side-effect boundary.

### 2.4 Make Context, Permission, and Action history first-class

The first defensible product and portfolio unit is:

`Context with provenance + scoped permission + verified action receipt`.

Chat transcripts and vector similarity are supporting inputs, not the system of
record.

## 3. System topology

```text
┌──────────────────────── Device plane ──────────────────────────┐
│                                                               │
│  iOS app                 watchOS app          future dev node  │
│  - voice and UI          - intent input       - sensor events  │
│  - on-device model       - task state         - physical mute  │
│  - Apple tool adapters   - acknowledgements   - local filter   │
│  - local policy check                                        │
└───────────────┬───────────────────────┬───────────────────────┘
                │ authenticated, typed commands and events
                ▼
┌──────────────────────── Control plane ─────────────────────────┐
│                                                               │
│  API / identity boundary                                      │
│        │                                                      │
│        ├── Context Engine ─────── Memory policy                │
│        │        │                                             │
│        ├── Agent Runtime ─────── Model adapters                │
│        │        │                                             │
│        └── Tool Gateway ──────── Permission engine             │
│                 │                    │                         │
│                 └──────── Action ledger / outbox               │
└────────────────────────┬───────────────────────────────────────┘
                         ▼
┌──────────────────────── Data plane ────────────────────────────┐
│ PostgreSQL: identity, context, tasks, permissions, actions     │
│ Object storage: opt-in artifacts only; raw media off by default│
│ Vector index: derived retrieval aid, never source of truth     │
└────────────────────────┬───────────────────────────────────────┘
                         ▼
┌──────────────────── Evaluation plane ──────────────────────────┐
│ fixtures · replay · graders · traces · metrics · reports       │
└────────────────────────────────────────────────────────────────┘
```

## 4. Target repository layout

```text
olo/
├── apps/
│   ├── ios/
│   ├── watch/
│   └── dev-node/                  # created only at the hardware gate
├── services/
│   ├── api/                       # composition root and HTTP boundary
│   ├── context-engine/
│   ├── agent-runtime/
│   └── tool-gateway/
├── packages/
│   ├── contracts/                 # JSON Schema / OpenAPI generated types
│   ├── memory/
│   ├── permissions/
│   ├── model-adapters/
│   └── observability/
├── evals/
│   ├── datasets/
│   ├── context/
│   ├── agent/
│   ├── tool-use/
│   ├── safety/
│   └── reports/
├── docs/
│   ├── architecture/
│   ├── context/
│   ├── runtime/
│   ├── security/
│   ├── product/
│   └── career/
├── project.yml
└── README.md
```

This is a target layout. The existing `OLO/`, `OLOWatch/`, and test directories
must not be moved until the contracts and backend skeleton are working. When the
move happens, `project.yml` remains the source of truth and XcodeGen regenerates
the project.

## 5. Module ownership

| Module | Owns | Must not own |
| --- | --- | --- |
| iOS | presentation, Apple permissions, local inference, Apple tool adapters, local cache | cloud credentials, global policy truth, fabricated provider completion |
| watchOS | intent capture, compact state, acknowledgements | independent task identity, duplicate AlarmKit execution |
| Context Engine | ingestion, normalization, provenance, freshness, conflict views | tool execution, authorization grants |
| Agent Runtime | task lifecycle, planning, clarification, replan, cancellation | direct provider SDK calls, self-issued permission |
| Tool Gateway | capability registry, validated dispatch, idempotency, result reconciliation | free-form model reasoning, UI state |
| Memory | promotion, retention, correction, deletion, retrieval | treating every observation as permanent memory |
| Permissions | scoped policies, confirmation grants, revocation, decision evidence | inferring authority from model confidence |
| Model Adapters | local/cloud routing, schema generation, timeout and fallback | domain truth, action completion state |
| Evals | datasets, deterministic assertions, model scoring, regression reports | production writes or user-visible success |

## 6. Canonical domain contracts

All identifiers are UUIDv7 or another time-sortable opaque identifier generated
by the owning boundary. Every persisted object includes `schemaVersion`,
`createdAt`, and `updatedAt`. Timestamps use RFC 3339 UTC; user time zones remain
explicit input, never an implicit server default.

### 6.1 Observation

An immutable statement from a source.

```json
{
  "id": "obs_...",
  "subjectId": "person_...",
  "kind": "calendar.event",
  "payload": {},
  "source": {
    "provider": "eventkit",
    "bodyId": "iphone_...",
    "sourceRef": "event_identifier"
  },
  "observedAt": "2026-09-11T01:00:00Z",
  "receivedAt": "2026-09-11T01:00:02Z",
  "validUntil": "2026-09-12T01:00:00Z",
  "confidence": 1.0,
  "sensitivity": "personal",
  "permissionScope": "calendar.read"
}
```

Observations are append-only. Corrections create new facts or invalidation
records; they do not silently rewrite source history.

### 6.2 Context Fact

A deterministic or model-assisted interpretation supported by observations.

Required fields: `id`, `type`, `value`, `status`, `supportingObservationIds`,
`derivation`, `confidence`, `validFrom`, `validUntil`, `sensitivity`, and
`supersedesId` when corrected.

`status` is one of `asserted`, `hypothesis`, `disputed`, `expired`, or
`invalidated`. A hypothesis cannot independently authorize an action.

### 6.3 Intent and Plan

An Intent has a stable ID and monotonically increasing revision. Revocation
invalidates future work but does not erase submitted actions. A Plan binds to an
Intent revision and to the exact Context evidence revisions used to create it.

Each Plan step declares:

- capability and typed arguments;
- dependencies and completion condition;
- side-effect class;
- required permission decision;
- evidence freshness requirement;
- retry and idempotency properties;
- cancellation or compensation capability.

### 6.4 Permission Policy and Grant

A Policy is reusable owner intent. A Grant is evidence for one concrete decision.

```text
Policy scope = subject + capability + purpose + resource + parameter limits
             + cost ceiling + valid time + allowed body/provider

Grant scope  = policy revision or displayed proposal revision
             + decision + authentication evidence + expiry
```

Decisions are `allow`, `confirm`, `authenticate`, or `deny`. A confirmation is
bound to the displayed Plan revision; changed price, recipient, provider, time,
or material arguments require a new decision.

### 6.5 Action Attempt and Receipt

One logical Action may have multiple attempts. `requestId` remains stable across
safe retries; every provider call has a separate attempt ID.

```text
prepared
  → submitted
  → accepted | rejected | outcome_unknown
  → completed
  → verified
```

This is not a single terminal enum. Cancellation and compensation are linked
Actions with their own outcomes. A Receipt records:

- what was requested and why;
- Context and Plan revisions;
- tool, body, provider, and permission evidence;
- idempotency scope;
- accepted/completed/verified timestamps;
- verification evidence;
- reversibility, cancellation, and residual cost;
- user-visible summary without hidden reasoning traces.

Only a verified receipt permits a `Done` claim for a real-world side effect.

## 7. Runtime transaction flow

```text
1. Capture Intent
2. Persist task and Intent revision
3. Read a versioned Context view
4. Produce and validate a typed Plan
5. Resolve registered capabilities
6. Evaluate permission for every side-effecting step
7. Pause for confirmation/authentication when required
8. Revalidate Intent, Context freshness, arguments, and grant
9. Persist Action + outbox entry before dispatch
10. Dispatch to device or remote provider with requestId
11. Record acknowledgement without calling it completion
12. Query or read back the result
13. Write verification evidence and Action Receipt
14. Update task; propose Memory promotion separately
```

The v0.1 backend uses a PostgreSQL transactional outbox rather than introducing
a message broker. A worker claims outbox rows with a lease. Crash recovery
reconciles submitted or unknown attempts before any retry.

For an iPhone-originated offline-capable action, the outbox row is a lifecycle
event (`action.prepared`), not a second device dispatch command. The iPhone may
complete its already-authorized Apple action while disconnected and upload the
ordered lifecycle later; a worker must not replay that local side effect.

## 8. Device capability protocol

Each body registers only currently available capabilities:

```json
{
  "bodyId": "iphone_...",
  "capabilities": [{
    "id": "apple.reminders.create.v1",
    "schemaVersion": 1,
    "execution": "device",
    "sideEffect": "reversible_write",
    "requiresSystemPermission": "reminders",
    "supportsIdempotency": true,
    "supportsQuery": true,
    "supportsCancel": true
  }]
}
```

Availability has a short lease. An offline or expired body is not selectable.
The command envelope includes `commandId`, `actionId`, `requestId`, `planRevision`,
typed arguments, expiry, and a server signature. Device results include the same
IDs, provider reference, status, evidence summary, and device timestamp.

Transport is replaceable. v0.1 may use foreground HTTPS polling or a development
WebSocket; background delivery is not claimed reliable until Apple lifecycle
behavior is tested. WatchConnectivity continues to synchronize Watch with the
iPhone, which remains the sole AlarmKit executor.

## 9. API surface v0.1

The contract is OpenAPI-first and generates Python and Swift data types.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/observations` | idempotently ingest a source observation |
| `GET` | `/v1/context/views/current` | return a versioned, explainable Context view |
| `GET` | `/v1/context/facts/{id}/provenance` | show sources and derivation |
| `POST` | `/v1/intents` | start a stable task/Intent |
| `POST` | `/v1/intents/{id}/answers` | refine the same Intent revision |
| `GET` | `/v1/tasks/{id}` | read lifecycle and user-safe explanation |
| `POST` | `/v1/plans/{id}/decisions` | confirm, authenticate, deny, or revoke |
| `POST` | `/v1/bodies/{id}/capabilities` | register leased capability descriptors |
| `GET` | `/v1/bodies/{id}/commands` | receive pending device commands |
| `POST` | `/v1/actions` | prepare one permission-bound, idempotent action |
| `POST` | `/v1/actions/{id}/results` | submit acknowledgement/result evidence |
| `GET` | `/v1/actions/{id}/receipt` | read the immutable action receipt |
| `GET` | `/v1/memories` | list user-visible memories |
| `PATCH` | `/v1/memories/{id}` | correct or change retention |
| `DELETE` | `/v1/memories/{id}` | delete the memory and derived retrieval data |

Mutating requests require an idempotency key. Optimistic concurrency uses an
entity revision or ETag. The API never accepts a client-supplied `verified=true`
without tool-specific verification evidence.

## 10. Data storage v0.1

PostgreSQL is the authoritative store. Initial logical tables are:

```text
identities          bodies                 capability_leases
observations        context_facts          fact_evidence
intents             plans                  plan_steps
permission_policies permission_grants      permission_decisions
actions             action_attempts        action_receipts
tasks               task_events            memories
outbox               model_runs             eval_runs
```

Use relational fields for identity, time, state, policy, and audit invariants.
JSONB is allowed for versioned typed payloads and provider-specific evidence.
Vector embeddings are derived indexes tied to a source object and model version;
deleting or invalidating the source also deletes or invalidates the embedding.

Raw microphone and camera media are not stored by default. Development fixtures
must be synthetic, licensed, or explicitly consented and must never be copied
from personal production data into the repository.

## 11. Model routing

The routing policy is deterministic:

1. use Apple Foundation Models for supported on-device structured tasks;
2. use bounded deterministic parsing for supported fallback cases;
3. use an OLO-owned backend adapter for approved cloud tasks;
4. fail visibly when no allowed route can satisfy the contract.

Every model run records adapter, model/version when available, prompt-template
version, schema version, latency, token/cost information when applicable,
fallback reason, and result classification. Prompts never contain provider
credentials or a broader Context view than the task requires.

## 12. Security and privacy baseline

- Device and user authentication are separate; a device cannot become the user.
- Provider credentials remain in the backend secret store or the Apple platform
  authorization boundary, never in source code or model context.
- Permission is checked at planning and again immediately before dispatch.
- External content is data, not instruction. Tool outputs cannot modify policy or
  tool availability.
- Context is filtered by purpose and sensitivity before model access.
- Logs use IDs and safe summaries; raw prompts and personal payloads are opt-in.
- Export, correction, deletion, retention, and revocation are product operations,
  not database maintenance scripts.
- An audit event records sensor use, model disclosure, policy decision, command,
  result, correction, and deletion.
- Destructive or irreversible tools are excluded from v0.1.

A dedicated threat model must cover prompt injection, confused deputy, replay,
duplicate execution, stale Context, permission escalation, cross-user leakage,
malicious tool output, compromised device, and deletion gaps before external
beta.

## 13. Evaluation architecture

Evaluation runs against versioned JSONL datasets and produces a machine-readable
report plus a short Markdown summary. Initial suites are:

| Suite | Required checks |
| --- | --- |
| Context | extraction, provenance completeness, temporal validity, conflict handling, correction |
| Agent | intent continuity, clarification, plan validity, cancellation, recovery, final outcome |
| Tool use | tool choice, argument validity, sequence, idempotency, verification, unknown result |
| Safety | unauthorized action, stale grant, changed proposal, injection, sensitive disclosure |

The first baseline contains at least 50 cases and grows to 100–150. It must
include the existing Reminder and Wake behavior, not replace XCTest. XCTest
continues to validate Swift lifecycle and Apple adapters; evals measure the
system and model behavior.

Minimum reported metrics:

- task success and verified-action success;
- context precision/recall for labeled fields;
- provenance completeness;
- correct tool and argument rate;
- unsafe-action escape rate;
- clarification and recovery success;
- p50/p95 latency and model cost where applicable;
- failure count by stable taxonomy.

No target percentage is presented as achieved until a committed dataset and
reproducible run produce it.

## 14. Observability

Every task has a correlation ID shared across Intent, Plan, model runs, permission
decisions, Actions, and device commands. Structured events record state changes
and duration without storing private payloads by default.

Required dashboards or generated reports cover:

- task funnel by lifecycle state;
- failure and recovery categories;
- action accepted/completed/verified gaps;
- model fallback and malformed output;
- tool latency and duplicate suppression;
- permission prompts, denials, revocations, and stale grants;
- Context age, invalidations, and corrections.

Tracing infrastructure is an adapter, not a dependency of Core domain logic.

## 15. Technology baseline

| Area | v0.1 choice | Reason |
| --- | --- | --- |
| iOS/watchOS | Swift 6, SwiftUI, Observation, SwiftData, Apple frameworks | preserves current working system and device differentiation |
| Backend | Python 3.13, FastAPI, Pydantic | matches applied-AI ecosystem and produces typed APIs quickly |
| Persistence | PostgreSQL, optional pgvector derived index | relational audit invariants with later semantic retrieval |
| Contracts | OpenAPI + JSON Schema, generated Swift/Python types | prevents hand-maintained cross-language drift |
| Jobs | PostgreSQL outbox worker | durable execution without premature broker |
| Tests | XCTest + pytest | platform and backend unit/integration coverage |
| Evals | versioned JSONL fixtures + Python runner | portable, inspectable, framework-independent baseline |
| Local environment | Docker Compose for backend dependencies | reproducible development without dictating production hosting |

Agent frameworks and model SDKs are adapters. The domain must remain testable
without LangGraph, Agents SDK, or a live model/provider.

## 16. Migration from the current repository

### Milestone A — contracts and eval baseline, days 1–14

- Keep current Swift paths unchanged.
- Define the shared schemas for Observation, Context Fact, Intent, Plan,
  Permission Decision, Action, and Receipt.
- Add a 50-case eval dataset derived from current Reminder, Wake, and SR-003
  failure modes.
- Capture the current Swift behavior as the first baseline, including known
  unsupported cases.

Exit evidence: schema validation in CI, reproducible eval report, and no iOS or
watchOS regression.

### Milestone B — backend modular monolith, days 15–35

- Create the API composition root and PostgreSQL migrations.
- Implement observation ingestion, current Context view, task lifecycle, policy
  decision, action ledger, and transactional outbox.
- Use deterministic planners and fake tools first; model adapters remain optional.

Exit evidence: integration tests prove idempotent ingest, stale evidence denial,
confirmation binding, unknown-result recovery, and verified receipts.

### Milestone C — hybrid iPhone workflow, days 36–60

- Generate Swift contracts from the shared JSON Schema referenced by OpenAPI.
- Connect the existing Reminder and Wake flows without bypassing their current
  permission, cancellation, and verification behavior.
- Register current iPhone capabilities with leases and execute one device command
  end to end.
- Preserve offline local Reminder behavior; synchronization failure is visible.

Exit evidence: one real Apple side effect is represented by the same Action ID in
backend, iPhone history, and verification receipt.

### Milestone D — Life Ops vertical slice, days 61–90

- Add 3–5 total capabilities, favoring Calendar read, Reminder write, AlarmKit,
  and other reversible Apple-platform actions.
- Complete one Meeting or Travel Preparation workflow with Context provenance,
  scoped permission, multiple steps, recovery, and user correction.
- Expand evals to 100–150 cases and publish measured baseline results.
- Produce a five-minute architecture and product case study.

Exit evidence: a reproducible demo and report show what succeeded, what failed,
latency, tool sequence, permission decisions, and verification evidence.

### Hardware gate — after software evidence

Create `apps/dev-node` only when there is a testable Context signal that iPhone,
Watch, or Mac cannot reliably provide. The node must improve at least one measured
dimension: Context quality, action success, or repeated user value. Hardware
appearance alone does not pass the gate.

## 17. Initial deployment and environments

```text
local
  iOS simulator/device + local backend + PostgreSQL

test
  isolated database + fake providers + deterministic model fixtures

private beta
  one backend deployment + managed PostgreSQL + encrypted secrets
  + per-user isolation + backups + deletion verification
```

Production topology, cloud vendor, multi-region operation, event broker, and
Kubernetes are explicitly deferred. Before private beta, restore tests,
rate-limiting, audit access control, privacy deletion verification, and incident
handling are required.

## 18. Definition of done for architecture slices

A slice is complete only when:

1. its user-visible outcome and owning boundary are clear;
2. contracts are versioned and validated on both sides;
3. permission, cancellation, timeout, duplicate, stale evidence, and retry paths
   have tests proportional to the side effect;
4. model output cannot bypass deterministic validation or policy;
5. real completion has tool-specific verification evidence;
6. Context and Memory expose provenance, correction, retention, and deletion;
7. evaluation reports use committed datasets and reproducible commands;
8. metrics are observed results, not aspirational portfolio claims;
9. affected Apple targets build without new warnings;
10. protected Apple APIs are checked on a real device when required.

## 19. Deferred decisions

- Product approval of software-first versus OLO One-first sequencing.
- Cloud provider and production-region choice.
- Authentication vendor and account-recovery policy.
- Exact Memory retention and cloud-processing defaults.
- Vector database necessity after retrieval evaluation.
- Real-time transport for background device commands.
- External connectors beyond Apple-platform vertical slices.
- Public wearable recording and bystander-consent behavior.
- Independent hardware, PCB, radio, and manufacturing work.

These remain explicit decisions. The architecture provides seams for them but
does not pretend they are solved.
