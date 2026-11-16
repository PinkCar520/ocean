# OLO product decision log

This log records product-owner decisions made after the current master baseline, [`OLO Product PRD v1.0`](OLO_Product_PRD_v1.0.md). Entries here take precedence over conflicting v1.0 details until they are incorporated into the next master PRD version.

## 2026 09 08 First generation physical appearance baseline

Status: approved
Affected child specification: [`../HARDWARE_SPEC.md`](../HARDWARE_SPEC.md)
Target master version: v1.1

- The supplied OLO One appearance board is the first-generation physical appearance baseline.
- The external target is 50 mm diameter and 12.7 mm thickness, replacing the earlier approximate 50 × 12 mm value where they conflict.
- OLO One has no conventional general-purpose screen UI. Its black front face is a restrained identity and ambient-status display/light surface.
- The camera remains at the upper center of the front face.
- The first generation retains both bottom USB Type-C and rear magnetic charging.
- Handheld, lanyard, clip, and desktop stand are the baseline usage modes.

Engineering feasibility, internal packaging, weight, runtime, radio performance, display technology, ingress protection, certification, and manufacturing specifications remain subject to validation.

## 2026 09 08 Master PRD format and authority

Status: approved
Target master version: current governance

- `OLO_Product_PRD_v1.0.md` is the master Product PRD and highest persistent product baseline.
- The DOCX version is abandoned because reliable AI reading and rendering are not guaranteed.
- iOS, hardware controls, Memory, Agent, camera, Robot, World, Cloud, and future domains continue as versioned child PRDs or specifications under the master.
- No individual screen or prototype represents the whole OLO product.


## 2026 09 09 Foundation documentation and Product PRD v1.1

Status: approved product direction; incorporated into v1.1
Source: product owner's current local-document update request, continuing “Cybercab Deployment Watch” (conversation 6aa10037-eda4-83e9-a1b9-eb62337e06a2).
Evidence: [discussion excerpts](../research/2026-09-09-foundation-discussion.md). Assistant proposals in that archive are not blanket approvals.

- Human Pull → World Push is the product paradigm; Reduce Human Cognitive Load is the North Star.
- OLO is a Persistent Personal Agent / Personal Intelligence Layer. OLO One is its principal physical presence, with One AI · Many Bodies preserving one identity across bodies.
- Preserve Generation 1 appearance and v16. Retain a restrained Context-driven Display; the L0–L4 taxonomy remains open.
- Publish complete [v1.1](OLO_Product_PRD_v1.1.md), preserving v1.0. This supersedes the September 8 entry naming v1.0 as the current master. The approved 50 mm × 12.7 mm appearance target and charging / usage-mode decisions are carried forward.
- Separate Scenario Specification, Context Architecture and Context Model v0.2. SR-003, Runtime, and Ambient Display remain independent living specs.
- Context v0.2 captures Constraint, Observation temporal validity, Intent conflict/arbitration and Plan temporal windows. The conversational SR-001 walkthrough is design evidence, not engineering validation.
- No approval of a Context v0.3 schema, complete Action state machine, L0–L4 mapping, numerical confidence thresholds, Cybercab integration, delivery timeline, or code changes is implied.

Earlier entries above are preserved verbatim as history. The current authority rule is in [docs/README](../README.md).

## 2026 09 09 Development begins with SR-001

Status: approved scope / implementation authorized by product owner
Source: direct correction “应该先 SR-001” followed by “开发吧”.

- Development begins with SR-001 Wake Up; SR-003 remains a design stress test.
- Implement the minimal foreground simulated context → wake plan → intervention decision → explicit human response loop, with labeled fixture inputs.
- This does not authorize real autonomous waking, Home control or inferred sleep detection. Runtime details remain living specs.
- See [SR-001 executable specification](../scenarios/SR-001-Wake-Up-v0.1.md) and [implementation record](../engineering/SR-001-IMPLEMENTATION.md).

## 2026 09 10 Industry convergence is product validation

Status: approved product judgment; incorporated into v1.2
Source: product owner confirmation after reviewing Apple, Meta, Google, Lenovo, OpenAI and the 2026 Inclusion·外滩大会 direction.

- OLO accepts and endorses convergence with the mainstream direction of Persistent Personal Agent, Ambient Intelligence and One AI · Many Bodies.
- Convergence is external validation of the desired future product. OLO does not need to manufacture differentiation by centering capabilities that other companies have not yet proved.
- Approved wording: “OLO 并非建立在一个孤立的硬件猜想上。Apple、Meta、Google、Lenovo 与 OpenAI 的最新方向共同验证了 Persistent Personal Agent、Ambient Intelligence 与 One AI, Many Bodies 正在成为下一代个人计算范式。OLO 的任务，是通过具体的人类生活状态和真实行动闭环，让这个未来先成立。”
- Publish [Product PRD v1.2](OLO_Product_PRD_v1.2.md) while preserving v1.1 and v1.0.
- Maintain changing evidence separately in [AI Device & Industry Convergence](../research/OLO-AI-Device-Industry-Convergence.md). Rumored products remain labeled and do not become engineering requirements.

## 2026 09 11 PostgreSQL control plane and hybrid iPhone execution

Status: approved implementation direction
Source: product owner direction to replace the current in-memory repository with PostgreSQL and connect iOS through generated Observation, Intent, and Action Receipt contracts while retaining Apple local execution and offline capability.

- PostgreSQL is the authoritative Control Plane repository for identities, observations, tasks, permission decisions, actions, receipts, idempotency records, and the transactional outbox.
- Shared JSON Schema referenced by OpenAPI is the source for generated Swift wire contracts.
- iPhone remains a Device Plane body. Apple framework permission checks, cancellation, local side effects, and provider read-back verification continue locally.
- Control Plane synchronization is durable and best effort; loss of network connectivity must not block or falsely fail a verified local Apple action.
- The in-memory repository remains available only as an explicitly selected test adapter, not as the default API runtime.

## 2026 09 11 Wake joins the shared controlled action protocol

Status: approved implementation direction
Source: product owner direction to proceed with unifying the existing Wake and Reminder execution loop, Action Receipt visibility, and offline synchronization behavior.

- A general Agent Runtime is the deterministic control and execution boundary around model reasoning; it is not synonymous with an LLM or model-level agent loop.
- Reminder and Wake share Action identity, lifecycle, permission, verification, local Receipt, and best-effort Control Plane synchronization semantics.
- The SR-001 Wake planner continues to own its domain plan and single AlarmKit session. This change does not permit a model to call AlarmKit directly or bypass user confirmation and Apple permission checks.
- Device-local verified evidence remains usable offline. Backend receipt creation or synchronization success does not substitute for Apple provider read-back verification.
