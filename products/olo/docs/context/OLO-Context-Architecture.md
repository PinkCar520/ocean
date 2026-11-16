# OLO Context Architecture

Status: Foundation design direction / living spec  
Date: 2026-09-09  
Parent: [PRD v1.1](../product/OLO_Product_PRD_v1.1.md)  
Source: [discussion evidence](../research/2026-09-09-foundation-discussion.md), Foundation 01.

## Purpose

Personal Context represents Who / Where / When / State / Activity / Environment / Intent / Schedule / Relationships / Devices / World Events / History / Permissions / Confidence relevant to a decision. OLO combines evidence into an understanding of a person's situation; a collection of API values alone is insufficient.

## Responsibilities

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Sensing | Physical signals from One / Watch / Home; digital context from personal tools; external world events | These are possible sources, not verified access rights or available integrations |
| Context Fusion | Normalize and correlate evidence in time, space and identity | Preserve source, freshness, uncertainty and contradictions |
| Human State | Wakefulness, activity, mobility, attention, social/work context and urgency | Multiple dimensions; missing evidence remains unknown |
| Personal Context Graph | Link people, places, devices, goals and commitments | Semantic relationships; no graph database selection implied |
| Memory | Retain appropriate meaning across sessions | Context does not automatically become permanent memory |
| Confidence | Express uncertainty in hypotheses and decisions | Cannot grant authority; no fixed thresholds adopted |
| Intervention | Decide whether, when and through which body to approach the person | SILENT is an explicit possible decision |
| Planner | Maintain goals, constraints and an adaptable plan | Events can invalidate plans; scheduling is not a static workflow |
| Orchestrator | Route actions to permitted capabilities and bodies | Availability, authority and results must be checked |
| Permission / Trust / Audit | Bound autonomy and explain material decisions | Applies throughout the loop, not just at the final call |

Conceptual flow: Evidence → Fusion → State / Graph → Hypotheses / Intent → Planning & Intervention → Authorized orchestration → Result evidence → Context update. Memory, authority and audit cross these responsibilities. Exact execution order, concurrency and restart behavior belong to Runtime.

## Memory direction

| Class | Meaning | Open detail |
| --- | --- | --- |
| M0 Ephemeral | Immediate observations, discard after their purpose | Exact TTL and deletion enforcement |
| M1 Session | Context for a state cycle or task | Session closure and retention |
| M2 Personal Pattern | Repeated, useful patterns | Minimum evidence, correction and expiry |
| M3 Explicit Memory | What the user asks OLO to remember | Scope, editing, deletion and synchronization |

Store meaning, discard surveillance. One event does not establish a routine. Users must be able to inspect and correct memory; sensitive data needs explicit scope. Durations in the discussion are illustrative, not retention policy.

## Physical presence and deployment

OLO One supplies Presence, spatial Sensing, Ambient Interaction and physical Trust / Privacy. Watch, iPhone, AirPods, Mac, Home and Vehicle have complementary roles; OLO does not require one device to do everything. Generation 1 appearance remains the existing baseline.

This architecture does not choose local versus cloud inference, databases, model providers, SDKs, operating-system permissions or third-party protocols. Capability feasibility must be checked against current primary sources when implementation is scoped. Cybercab remains a hypothetical mobility provider in scenario tests.

## Next validation

Use [Context Model v0.2](OLO-Context-Model-v0.2.md) in [SR-003](../scenarios/SR-003-Leaving-Cybercab.md). Record missing evidence, stale context, identity conflicts, unavailable bodies and revoked authority. Derive deployment and integration requirements from those failures before publishing System Architecture or Capability contracts.
