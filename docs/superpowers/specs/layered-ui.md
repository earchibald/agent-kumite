---
title: "Agent Kumite — Layered UI Separation Spec"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-13
locked_by: AK-13
supersedes: []
---

# Layered UI Separation Spec

## Framing (binding)

> **Agent Kumite phase-1 operator surfaces MUST NOT collapse public events, privileged private state, alerts, and intervention work into one mixed feed. Every live fact has a canonical layer; any cross-posting is explicit, sparse, and link-back based.**

This is a locked decision, not a candidate. It operationalises REC-11 in `Agent Kumite.md` and gives AK-14 (Swift control room) and AK-15 (Discord layer) a shared routing contract before either surface is finalized. Incident-response and observability tools separate inspectable detail, attention-routing alerts, and actionable incidents for good reason: operators need to know what is safe to watch continuously, what is privileged drill-down, and what requires intervention now.[^pagerduty-incidents][^datadog-alerting][^langfuse] Kumite adopts the same discipline so spectacle, diagnosis, and intervention do not contaminate one another.

Three locked specs already force the separation:

1. `observation-vs-intervention.md` (AK-3) forbids affordance leakage between read-only and intervention-enabled conditions.
2. `thought-trace-labeling.md` (AK-4) requires `reported_reasoning` and related trace material to remain epistemically and visually distinct.
3. `awaiting-human-nudge-state.md` (AK-12) makes intervention work canonical objects with their own lifecycle rather than ambient chat messages.

AK-13 is the surface contract that keeps those decisions legible in live UI.

## Why the single mixed feed is banned

One scrolling "everything feed" fails four different jobs at once:

1. **It hides action inside narration.** A pending approval should not have to compete with round banter and score updates for operator attention.
2. **It leaks privileged state into spectator-facing context.** DMs, unrevealed commitments, and `reported_reasoning` are operator-only inspection surfaces, not things to sprinkle into the same pane as public square events.
3. **It makes alerts indistinguishable from history.** An interruptive alert is supposed to say "look now", not just become another row in a transcript.
4. **It erodes C4/C5 discipline.** Once read-only inspection and intervention work share one surface, it becomes easier to smuggle live controls into observation mode or to treat phase-1-excluded interventions as ordinary buttons.

The UI therefore separates *what happened*, *what only privileged operators may inspect*, *what needs attention*, and *what needs human action*.

## Four-layer contract

| Layer | Canonical contents | Operator posture | Must not contain |
| :--- | :--- | :--- | :--- |
| **Public stream** | Round opens/closes, public square utterances, revealed votes/commitments, eliminations/deadlocks, score changes, replay markers, public-facing tension cues | Continuous watching and recap | DMs, unrevealed commitments, raw trace contents, editable intervention payloads |
| **Private state** | DMs, pre-reveal commitments, analyst privileged reads, referee-only diagnostics, `reported_reasoning`, divergence drill-down, audit detail behind operator-only controls | On-demand privileged inspection | Spectator-facing summaries that expose hidden content, push-style paging, live intervention controls mixed into the same pane |
| **Alerts** | Attention-routing objects derived from source state: failures, freshness breaches, new urgent conditions, timeout risk, escalations, high-salience transitions | Sparse interrupt handling | Full diagnostic dumps, complete intervention forms, chat-like history |
| **Intervention queue** | Open `await_id` items, pending `question` / `nudge` / `approval` work, disabled phase-1 placeholders for `role swap` / `freeze` / `ejection`, resolution status | Bounded actionable backlog | Ambient match narration, generic telemetry alerts, privileged context unrelated to the queued action |

The canonical-layer rule is strict:

- A **public event** lives in the public stream even if it also raises an alert.
- A **privileged fact** lives in private state even if the operator gets an alert that something new is available.
- A **human-action item** lives in the intervention queue even if the operator is pinged about it.
- An **alert** points back to its source layer; it does not become the permanent home of the underlying fact.

## Density thresholds and duplication discipline

Each layer has a different allowed density. The threshold is a behavioral contract, not just a visual preference.

| Layer | Density threshold | Duplication rule |
| :--- | :--- | :--- |
| **Public stream** | **Continuous.** High event density is acceptable because the stream is the canonical public chronology. Swift may keep it live and ambient; Discord mirrors only the punctuated subset a remote observer would want pushed. | Do not duplicate private payloads or intervention forms into the stream. If an alert-worthy public beat occurs, alert output is a terse pointer back to the stream item. |
| **Private state** | **Dense-on-demand, zero by default.** Rich detail is allowed only after the operator intentionally opens a drawer, inspector, thread, or restricted view. | Never fan out raw private content into public or alert channels. Cross-post only summaries or entry points that preserve privilege boundaries. |
| **Alerts** | **Sparse and state-transition based.** Enter, escalate, acknowledge, resolve; not heartbeat spam. At most one active alert per underlying concern. | Alerts update in place or resolve in place. They should point to the public-stream item, private-state view, or queue entry that actually owns the details. |
| **Intervention queue** | **Bounded by open work.** One entry per live `await_id` or disabled placeholder, mutated in place as status changes. | Queue items do not spawn chatty follow-up rows. Resolution, timeout, or supersession updates the existing item rather than adding narrative noise elsewhere. |

This produces one practical rule of thumb:

> **If a row can be safely ignored until the operator chooses to inspect it, it is not an alert. If it requires structured human action, it is not just a stream event. If it contains hidden context, it is not public.**

## Primary vs secondary placement by surface

AK-14 and AK-15 may differ in ergonomics, but not in which layer owns which class of information.

| Layer | Swift control room (AK-14) | Discord layer (AK-15) |
| :--- | :--- | :--- |
| **Public stream** | **Primary.** A persistent timeline / recap surface with ambient score, round, and tension context is expected. | **Secondary.** Broadcast only concise public updates, recap beats, and high-salience markers; do not mirror the full firehose. |
| **Private state** | **Primary.** Swift owns the rich inspector surfaces for DMs, `reported_reasoning`, divergence detail, and other privileged drill-down. | **Secondary and restricted.** Discord may mirror narrow operator-only summaries or audit pointers in RBAC-limited channels, but it must not become the default firehose for hidden state. |
| **Alerts** | **Primary.** Swift owns the alert center / banner / toast behavior because it is the operator's main continuous surface. | **Secondary.** Discord carries only escalated, unresolved, or remote-observer-relevant alerts; it is a notification mirror, not the canonical alert inbox. |
| **Intervention queue** | **Primary.** Swift owns the rich queue, item detail, structured inputs, and disabled future-affordance presentation. | **Secondary.** Discord may expose queue summaries or simple approvals only when it can preserve canonical `await_id` / `choice_id` semantics; otherwise it must redirect the operator back to Swift. |

The asymmetry is deliberate:

1. **Swift is the dense control room.** It may remain continuously open and context-rich.
2. **Discord is the punctuated remote surface.** It should stay concise, legible, and audit-friendly rather than trying to be the whole cockpit.
3. **Primary vs secondary is per layer, not per product.** Discord can be a valid secondary home for alerts or approvals without inheriting Swift's responsibility for dense private inspection.

## Condition and affordance discipline

Layering is also how AK-13 enforces phase-1 experimental hygiene:

1. **C4 (observation-only)** keeps the public stream and private-state inspection surfaces available, but the intervention queue shows no enabled intervention work. Alerts may report freshness or operational problems; they must not imply that a live intervention is available when the condition forbids it.
2. **C5 (intervention-enabled)** may populate the intervention queue only with `question`, `nudge`, and `approval` items that resolve through the canonical `awaiting` contract.
3. **Phase-1-excluded interventions** (`role swap`, `freeze`, `ejection`) appear only as disabled placeholders in the intervention queue. They are not hidden entirely, but they are never rendered as live buttons and never escalated as alerts.
4. **Private-state triggers stay private.** An alert may say that a new divergence signal or trace-linked concern exists, but the privileged payload itself remains in the private-state layer.

## Routing examples

The layer split should be obvious in common cases:

- **A new DM arrives.** It lands in private state. Swift may badge the relevant inspector. Discord does not post the DM into a public channel; at most it posts a restricted summary or nothing at all.
- **A reveal window opens.** The public stream records the beat. Swift may render a strong visual cue; Discord may post one concise marker. The cue does not become an intervention item.
- **An `await_id` is created.** The intervention queue gets the canonical item. Alerts may ping "approval pending" or "timeout soon", but the structured form stays with the queue entry.
- **A model emits `reported_reasoning`.** The trace appears only in private state under AK-4's labeling rules. Any public recap refers to the outcome or divergence, not the raw trace text.

## Out of scope, with pointers

| Topic | Tracked in |
| :--- | :--- |
| Match rules, round loop, eliminations, scoring | `docs/superpowers/specs/v0-match-spec.md`, AK-5 |
| Observation-only vs intervention-enabled condition semantics | `docs/superpowers/specs/observation-vs-intervention.md`, AK-3 |
| Thought-trace naming and blurb requirements | `docs/superpowers/specs/thought-trace-labeling.md`, AK-4 |
| Tension cues and public beat routing rules | `docs/superpowers/specs/tension-director.md`, AK-11 |
| Canonical pause/resume lifecycle for human action | `docs/superpowers/specs/awaiting-human-nudge-state.md`, AK-12 |
| Swift screen hierarchy, component layout, and MVP implementation | AK-14 |
| Discord RBAC, channel policy, and audit semantics | AK-15 |

## Cross-references

- `docs/superpowers/specs/phase-1-thesis.md`: fixes the benchmark-first / show-first framing and the downstream surface rows this spec now fills.
- `docs/superpowers/specs/observation-vs-intervention.md`: fixes the C4/C5 affordance discipline that this layering contract must preserve.
- `docs/superpowers/specs/thought-trace-labeling.md`: fixes the epistemic and visual handling of `reported_reasoning`, which AK-13 routes into the private-state layer.
- `docs/superpowers/specs/tension-director.md`: fixes how public-state cues route across Swift and Discord; AK-13 fixes which layer they belong to.
- `docs/superpowers/specs/awaiting-human-nudge-state.md`: fixes the canonical intervention object lifecycle that the intervention queue must render.

[^pagerduty-incidents]: PagerDuty incident model, including the distinction between incidents, alerts, severities, and notifications: https://support.pagerduty.com/main/docs/incidents
[^datadog-alerting]: Datadog monitor guidance on separating alerting from broader diagnostic observability and alerting only on what matters: https://docs.datadoghq.com/monitors/
[^langfuse]: Langfuse tracing overview, distinguishing tracing/observability from alerting and positioning traces as structured diagnostic context: https://langfuse.com/docs/tracing
