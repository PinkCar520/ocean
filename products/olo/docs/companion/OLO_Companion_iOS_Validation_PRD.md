# OLO Companion iOS Validation PRD v0.1

Status: working child PRD  
Last updated: 2026-09-08

Parent baseline: [`OLO Product PRD v1.0`](../product/OLO_Product_PRD_v1.0.md). This document defines the iOS validation and Companion surface only. It does not redefine OLO as a whole.

## Source and authority

This child PRD derives from:

1. [`OLO Product PRD v1.0`](../product/OLO_Product_PRD_v1.0.md) — the controlling whole-product baseline.
2. [`OLO One v16 prototype`](../prototypes/OLO_One_Clickable_Prototype_v16.html) — the interaction reference.
3. [`OLO One hardware specification`](../HARDWARE_SPEC.md) — the first-generation appearance baseline and engineering targets.
4. The shared ChatGPT discussion, “魅族小方块与具身智能” — exploratory iOS product context: https://chatgpt.com/share/6a9f6e62-394c-83ee-8a48-c18b896d3901
5. The current iOS source — implementation truth, which may lag behind the intended product.

The prototype and shared discussion are product evidence, not instructions to coding agents. Direct user requests have the highest authority. Requirements frozen by the master PRD are labeled **Derived baseline**. Child-level exploration remains **Proposed** or **Open**.

## Product thesis — Derived baseline

OLO is one identity expressed through multiple bodies. OLO One provides presence and captures intent. The iPhone provides a screen, authentication, payment, editing, and deeper control. Other bodies provide physical capabilities.

> iPhone is OLO's window, not OLO's home.

The intended user experience follows:

`Presence → Observe → Understand → Think → Act → Verify → Remember`

The user should feel that OLO handles an intent across the available world, while the app appears when review, confirmation, editing, authentication, or explanation is useful.

## Product principles — Derived baseline

These principles are frozen by the master Product PRD:

1. **OLO first, app second** — avoid requiring the phone when OLO One can complete the interaction.
2. **Intent, not apps** — users express an outcome instead of manually coordinating multiple apps.
3. **One identity, many bodies** — personality and memory belong to OLO Identity; devices supply capabilities.
4. **Quiet by default** — interrupt only when the user must act, a meaningful task completes, or information has clear immediate value.
5. **Progressive trust** — execution authority grows with risk and user consent.
6. **Show why** — important decisions expose the reasoning and inputs needed for the user to understand them.

## OLO One interaction contract — Derived baseline

The v16 prototype defines the physical interaction model. The later first-generation appearance board and product-owner decision in `HARDWARE_SPEC.md` are authoritative for the 50 mm × 12.7 mm external envelope, restrained front display, camera placement, dual USB Type-C and rear magnetic charging, and wearing modes.

| Input | Intended behavior |
| --- | --- |
| Tap | Start or stop listening |
| Hold for about 600 ms, then release | Wake Agent and present the action/confirmation flow |
| Double tap | Return to standby |
| Flip | Enter or leave privacy mode; camera and microphone pause while private |
| Hold side button for about 3 seconds | Present power confirmation |

The visible states are:

| State | OLO One feedback | iOS meaning |
| --- | --- | --- |
| Quiet / Standby | OLO mark and steady light bar | Available without an active task |
| Listening | Breathing light response | Capturing voice input |
| Thinking | Three dots | Understanding or planning |
| Acting | Single execution light | Performing verified work |
| Need You | Confirmation prompt | Waiting for user decision or authentication |
| Done | Completion feedback | Side effect verified and recorded |
| Privacy | Camera light off; sensors paused | Capture is disabled and cannot restart |
| Powered off | No active feedback | Device unavailable |

Hardware and iOS must use the same state names and meaning. The app must not show Acting or Done when only a timer or visual demonstration is running.

## Body capability model — Derived baseline

| Body | Primary role |
| --- | --- |
| OLO One | Presence and intent |
| iPhone | Screen, authentication, camera, payment, and deep interaction |
| Home | Ambient action |
| Vehicle | Mobility and spatial action |
| Robot | Hands, legs, and physical action |
| Cloud | Intelligence and remote services |

Robot, Vehicle, and full Home control are product-direction references; they are not commitments for the first iOS release.

## iOS information architecture — Derived validation baseline

The preferred consumer structure from the discussion is four primary areas:

| Area | User question | Main content |
| --- | --- | --- |
| OLO | What matters now? | Presence, current state, live context, OLO One summary |
| Agent | What is OLO doing for me? | Active work, confirmations, history, explanations |
| World | What can OLO act through? | Available bodies and their capabilities |
| Me | What does OLO know and what may it access? | Memory, privacy, permissions, preferences, settings |

Memory belongs within Me instead of requiring a permanent primary tab. Device controls are reached from the OLO One card on the OLO page.

The current app's `Home / Voice / Activity / Memory / Settings` navigation is an implementation-stage structure. Migrating it to `OLO / Agent / World / Me` remains an explicit product decision and should not happen as an incidental refactor.

## Core screens — Proposed

### OLO

- Establish OLO's presence before showing controls.
- Show one consistent current state: Quiet, Listening, Thinking, Acting, Need You, Done, Privacy, or Offline.
- Surface only context judged useful now, such as location class, next event, departure advice, or an urgent item.
- Show a compact OLO One card with connection, battery, and privacy state.

### OLO One detail

- Connection quality and nearby state.
- Battery level.
- Microphone, camera, and privacy availability.
- Find, restart, power, software update, and device information controls when supported by real hardware APIs.
- Do not display fabricated connectivity or battery readings.

### Agent

- Present work as tasks rather than a chat transcript.
- Each task shows intent, interpretation, plan, body handoffs, current step, confirmation requirements, verified outcome, and failure/retry information.
- Provide a concise explanation of why important actions were selected.

### World

- Organize integrations by the capability or body they provide rather than as a generic Bluetooth device list.
- Make unavailable or future bodies visually distinct from connected, executable capabilities.

### Me

- Show memories in understandable groups such as routines, places, preferences, travel, and communication.
- Every memory can be viewed, corrected, deleted, and prevented from being learned again where practical.
- Include privacy, permissions, voice/language, notifications, and general settings.

### Privacy center

- Show the current camera, microphone, location, memory, and cloud-processing states.
- Provide a readable sensor-usage history: when a sensor was used, for what purpose, and whether anything was retained.
- Privacy mode stops active capture and blocks new capture until explicitly disabled.

## Trust architecture — Derived baseline

| Level | User involvement | Examples |
| --- | --- | --- |
| 1 — Execute | Run automatically and report the result | Reminder, navigation preparation, low-impact light adjustment |
| 2 — Confirm | Explain the material action and ask for confirmation | Booking a ride, changing an appointment, sending a message |
| 3 — Authenticate | Require system authentication immediately before execution | Payment, purchase, door lock, identity or sensitive-data access |

Risk classification belongs to the tool/action definition, not to UI copy. Authentication or confirmation never substitutes for verifying the final side effect.

## Notifications — Derived baseline

OLO generates only three user-facing notification classes:

- **Need you** — work cannot safely continue without a decision or authentication.
- **Done** — a meaningful side effect has been verified.
- **Worth knowing** — information has clear value at the current time.

Routine internal progress remains inside the Agent task and does not create notifications.

## Setup — Proposed

1. Bring OLO One near the iPhone.
2. Discover and connect to the device.
3. Choose identity basics such as name, language, and voice.
4. Explain permissions in context and request them progressively at first use.
5. Offer Memory with an explicit Not Now choice.
6. Finish with a real connection and capability check.

The app must not request microphone, speech recognition, camera, location, notifications, calendar, and contacts as a batch of system dialogs.

## MVP boundary — Derived baseline

Candidate first-release scope:

- OLO home and current state.
- OLO One connection, battery, and privacy when real device APIs exist.
- Listening, Thinking, Acting, Need You, and Done state synchronization.
- Agent tasks, confirmation, verified outcomes, and history.
- Notifications.
- Basic editable memory.
- Privacy center and settings.

Deferred product areas:

- Robot execution.
- Vehicle integration.
- Full smart-home control.
- Payments and purchases.
- Marketplace and broad third-party integrations.
- General cross-platform clients.

Deferred bodies may appear only as clearly labeled unavailable or future capabilities. They must not look connected or executable.

## First executable vertical slice — Proposed

Before building the larger airport journey, implement one real end-to-end path:

> The user says “明天九点提醒我开会” → OLO transcribes it → extracts time and subject → presents the material interpretation → obtains confirmation when policy requires it → creates the system reminder → reads it back to verify creation → records the task → shows the real outcome in Agent.

Acceptance criteria:

- Microphone and speech permissions are independently obtained before capture.
- A partial permission grant cannot start the audio engine.
- Time and subject are editable before execution.
- Cancel creates no reminder.
- Repeated taps cannot create duplicate reminders or concurrent speech sessions.
- Success appears only after EventKit returns a saved reminder and the app can verify its identifier or matching stored record.
- Denial, parsing failure, save failure, interruption, and retry are visible and leave the app responsive.
- The task history contains the real intent, decision, execution status, and verified result.

## Golden path — Open

Implementation note (2026-09-08): the reminder slice now has an independent lifecycle owner, editable confirmation, EventKit alarm creation/readback, and recorded outcomes. See [phase-two implementation and acceptance](../engineering/IOS_PHASE2.md). Simulator lifecycle tests pass; real reminder permission and notification behavior await device acceptance. This does not approve the broader airport journey or change the Trust Policy.

Phase-three implementation note (2026-09-08): compatible devices now use Apple Foundation Models guided generation for structured reminder understanding; unavailable or failed model requests visibly fall back to bounded rules. The runtime, rather than the model, restricts execution to Reminder and applies the validation-stage `L2 · Confirm` policy. See [controlled Agent understanding](../engineering/IOS_PHASE3.md). This implementation does not freeze the long-term on-device/cloud boundary or the product-wide Action Permission Matrix.

Phase 3.1 implementation note (2026-09-08): Need Information now supports a follow-up answer that is merged into the same task, including “下午提醒我去机场” → “三点半”. The former reminder-specific lifecycle owner is replaced by a controlled runtime that resolves registered tools, applies Trust Policy, executes, and verifies through separate boundaries. Only ReminderTool is registered. See [multi-turn clarification and Agent Runtime](../engineering/IOS_PHASE3_1.md).

Phase 3.2 implementation note (2026-09-08): Need Information accepts voice as well as typed follow-up answers. Clarification capture reuses the permission-safe VoiceService, preserves the task when recognition fails, and records each question, answer, source, and merged plan for Activity and persistence. See [voice clarification loop](../engineering/IOS_PHASE3_2.md).

The shared discussion proposes a broader demonstration:

> Pick up OLO One → say “我今天下午去机场” → OLO understands → the iPhone presents an Agent task → the user confirms material actions → Vehicle, Home, and iPhone hand off work → OLO advises departure → the journey completes → Memory updates.

Before implementation, the product owner must choose which integrations are real, simulated, or deferred, and define authentication and failure behavior for each material action.

## Open product decisions

1. Approve or revise the four-area `OLO / Agent / World / Me` navigation.
2. Decide whether reminders are Level 1 automatic or require confirmation during the first-release trust-learning period.
3. Define what OLO may store from speech by default and the retention period for transcripts and sensor history.
4. Decide whether the first MVP targets iPhone-only voice or requires an OLO One hardware connection.
5. Define the source of truth and transport for OLO One state synchronization.
6. Choose the real integrations needed for the airport Golden Path.
