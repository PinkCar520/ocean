# OLO Context Model v0.2

Status: Living spec / semantic design baseline, not a database or production schema  
Date: 2026-09-09  
Parent: [PRD v1.1](../product/OLO_Product_PRD_v1.1.md) · [Context Architecture](OLO-Context-Architecture.md)  
Evidence: [Foundation 02 and SR-001 discussion](../research/2026-09-09-foundation-discussion.md).

## Ontology: 14 entities + Context + Plan

| Entity | Meaning and relevant information |
| --- | --- |
| Person | Actor with identity, relationships, preferences, commitments and presence |
| Place | Physical and semantic location, e.g. coordinates versus Home / Bedroom |
| Device | A body supplying sensing, interfaces or actions; owner, place, state and capabilities |
| State | Current understanding of a person, device, place, plan or action; human state is multidimensional |
| Event | A meaningful change relative to prior state, such as traffic worsening |
| Observation | What a source reported; source, type, value, observedAt, confidence, validUntil |
| Hypothesis | Inferred meaning with evidence, contradiction and uncertainty; can be revised |
| Intent | An actor's desired world outcome, owner, goal, target, priority and status; not merely a command |
| Commitment | Who owes what to whom, by when, in what context |
| Relationship | Why entities are connected, e.g. depends_on / owned_by / transports |
| Capability | What a node can provide; naming a capability does not establish availability |
| Permission | In what scope and circumstances OLO may decide or act for someone |
| Action | World-changing unit tied to intent, plan, reason, confidence, risk, authority, capability and result |
| Constraint | First-class hard or soft restrictions / objectives on an intent or plan |

Context is the effective evidence, states and hypotheses relevant to a decision at a moment. Plan describes steps toward an intent and may change after events. These two are system objects, additional to the 14 entities.

## Four v0.1 → v0.2 changes

1. **Constraint** becomes first-class: deadline, arrival buffer, sleep preservation and cost may conflict. Hard/soft status must be explicit for a given scenario, not universally assumed.
2. **Observation temporal validity**: record observation time and validity; stale traffic or sleep data cannot silently retain full decision weight. Decay function is a candidate, not a selected algorithm.
3. **Intent conflict / arbitration**: “attend on time” and “sleep longer” may conflict. Preserve both goals, explain consequences and ask the person where a meaningful conflict cannot be resolved within authority.
4. **Plan temporal windows**: earliest / preferred / latest windows can represent uncertainty and adaptation. Recompute feasibility when evidence changes; a preferred time is not a deadline.

## Distinctions that must survive implementation

Observation ≠ truth; Observation ≠ State; State ≠ Event; Hypothesis ≠ confirmed Intent; Intent ≠ Instruction; Confidence ≠ Permission; requested ≠ verified result. Device / Body naming is an implementation mapping to resolve, not a reason to add a new entity automatically.

Confidence aggregation must preserve supporting and contradictory evidence. Weighted rules or model reasoning were discussed as possible methods; no Bayesian model, weights or confidence cutoff is approved. Permissions describe agent authority in addition to OS access. Action lifecycle and policy enforcement remain Runtime work.

## SR-001 design walkthrough and limits

Evidence → state fusion → meeting intent + constraints → backward timing → wake window → SILENT or gradual intervention → observe actual waking → stop wake intervention → SR-002. Repeated patterns may later inform memory; isolated movement records should not become a permanent routine.

**This is a conversational stress-test walkthrough, not executed software or field validation.** The source has inconsistent sample timing: 09:30 meeting − 10 minute arrival buffer − 53 minute commute − 47 minute preparation = 07:40 latest wake; later it uses 07:32 without deriving the extra 8 minutes. With commute raised to 61 minutes, the same assumptions yield 07:32, not 07:24. Preserve the source but do not use its clock sequence as a fixture. A coherent wake window needs an explicitly justified additional buffer / preference before tests can pass.

Source confidence values, estimated windows and user-state detections are illustrative. They do not establish sensor accuracy, calibrated probability or safe action thresholds.

## Open items / promotion gate

- InterventionPlan is a candidate; it is deliberately not added to the 14-entity ontology.
- Intent revocation, Action cancellation / compensation, reservation semantics, authority revocation and identity handoff need SR-003.
- Missing / contradictory / expired observations need specified invalidation and recovery rules.
- Temporal feasibility, arbitration priority and memory retention need explicit test fixtures and policy.
- v0.3 has not been produced. Publish a new version only after recording SR-003 findings and distinguishing accepted changes from remaining proposals.
