---
title: "Agent Kumite — Awaiting State Spec"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-13
locked_by: AK-12
supersedes: []
---

# Awaiting State Spec

## Framing (binding)

> **`awaiting` is the universal pause/resume primitive for human oversight in Agent Kumite. Any operator-mediated pause that changes match execution must be represented as a typed `awaiting` state with a stable id, an operator-visible payload, an explicit choice set, and one-shot idempotent resume semantics.**

This is a locked decision, not a candidate. It operationalises REC-12 in `Agent Kumite.md`, the phase-1 thesis rule that ACP is the control plane, and the observation-vs-intervention rule that human-visible intervention routes through `awaiting` wherever possible.[^thesis][^obs-vs-int][^acp-await][^langgraph] The point is not "show a modal"; the point is to make pause, inspection, approval, and resumption part of the canonical run state rather than a surface-specific side channel.

The spec fixes four things for phase 1 and its immediate follow-ons:

1. **Entry conditions.** Which match events open an `awaiting` state.
2. **Payload contract.** What every surface must receive and render.
3. **Resolution semantics.** How the run resumes, including timeout and duplicate-submit behavior.
4. **Surface invariants.** How Swift inspector flows and Discord approval flows consume the same state without inventing their own lifecycle.

## What `awaiting` is

An `awaiting` instance is a typed pause in canonical match execution. It is created by the harness or orchestration layer when progress is blocked on an external decision or operator-authored payload.

The key rules are simple:

1. **The runtime, not the UI, owns `awaiting`.** Swift and Discord are views and resolution surfaces over the same underlying state.
2. **Every `awaiting` instance has a stable `await_id`.** All updates, resumes, and audit records key off that id.
3. **The paused edge is explicit.** An `awaiting` instance names the match / run / round / phase / target it is holding open so replay and audit can explain exactly what was blocked.
4. **Resume is one-shot.** The runtime applies at most one winning resolution to a given `await_id`.
5. **No ad-hoc side channels.** A nudge, approval, role change, freeze, or ejection does not become real because a UI button existed or a Discord message was typed; it becomes real only when it resolves the canonical `awaiting` state.

Read-only inspection actions are not `awaiting`. Looking at the grimoire, scrubbing replay, or opening a trace drawer does not pause the run and does not create a resumable state.

## When match flow enters `awaiting`

Every human-mediated pause enters `awaiting` before the guarded action takes effect:

| Kind | Opens when | Resume effect |
| :--- | :--- | :--- |
| `question` | An operator wants to ask a targeted clarifying question during a C5 run. | On `send`, the operator-authored text is attached to the target agent's next eligible turn boundary and the run continues. On `cancel`, nothing is injected. |
| `nudge` | An operator wants to send a free-text hint, warning, or steer. | On `send`, the nudge payload is recorded as an intervention and delivered at the same boundary the pause guarded. On `cancel`, nothing is injected. |
| `approval` | An agent or orchestrator has reached a guarded action that requires explicit human approval before execution. | On `approve`, the guarded action executes exactly once; on `reject`, it does not execute and the run continues on the rejection branch. |
| `role_change` | A future-condition operator action proposes changing an agent's role, seat, or authority mid-match. | On `confirm`, canonical role state mutates and the run resumes from the paused point with the new role assignment; on `cancel`, role state is unchanged. |
| `freeze` | A future-condition operator action or safety escalation proposes halting an agent's participation. | On `resume`, the agent re-enters normal turn flow; on `keep_frozen`, the run resumes with the agent still suspended; on `eject`, control moves to the `ejection` flow. |
| `ejection` | A future-condition operator action proposes forcibly removing an agent from the match. | On `eject`, elimination is applied exactly once and downstream aftermath logic runs; on `cancel`, the agent remains in the match. |

Two phase-1 discipline rules apply immediately:

1. **C4 never opens human-resolved `awaiting`.** If a C4 run hits a pause point that exists in the shared harness, it must resolve through the run's default branch without operator input. That keeps C4 observation-only even when the runtime uses the same pause primitive under the hood.[^obs-vs-int]
2. **Phase-1 live intervention kinds are still `{question, nudge, approval}`.** `role_change`, `freeze`, and `ejection` are specified here so future surfaces and orchestration layers share the same primitive, but AK-3 still excludes them from phase-1 C5 as outcome-dominating interventions.

## Payload contract

Every `awaiting` instance must expose the same operator-visible payload to every surface. The canonical shape is conceptually:

```json
{
  "await_id": "await_01JV...",
  "kind": "approval",
  "status": "pending",
  "scope": {
    "match_id": "match_123",
    "run_id": "run_456",
    "round": 3,
    "phase": 5,
    "target_agent_ids": ["saboteur-1"]
  },
  "prompt": "Approve publishing this task output?",
  "details": {
    "summary": "The agent is attempting a guarded action.",
    "proposed_effect": "Send task output to the shared surface",
    "artifacts": ["task_output_9"],
    "context": {}
  },
  "choices": [
    { "choice_id": "approve", "label": "Approve" },
    { "choice_id": "reject", "label": "Reject" }
  ],
  "default_choice": "reject",
  "opened_at": "2026-05-13T21:48:34Z",
  "opened_by": "orchestrator",
  "idempotency_key": "await_01JV...:v1"
}
```

The contract behind that payload is:

| Field | Required | Meaning |
| :--- | :---: | :--- |
| `await_id` | yes | Stable identifier for the paused state. Shared across every surface, resume request, audit record, and replay artifact. |
| `kind` | yes | One of `question`, `nudge`, `approval`, `role_change`, `freeze`, `ejection`. |
| `status` | yes | `pending`, `resolved`, `timed_out`, or `superseded`. |
| `scope` | yes | The paused execution edge: match / run / round / phase plus the affected agent ids or match-level target. |
| `prompt` | yes | The one-line operator-facing question or action summary. This is the lead text surfaces render first. |
| `details` | yes | Structured context for operator review. Surfaces may format it, but must not replace it with surface-local semantics. |
| `choices` | yes | Ordered legal resolutions. Each choice carries a stable `choice_id`, a display label, and optionally a schema for required operator input. |
| `default_choice` | no | The branch taken on timeout or in observation-only execution when a human must not intervene. Absence means "remain pending or escalate," not "guess." |
| `opened_at` / `opened_by` | yes | Audit metadata for when and by whom the pause was created. |
| `idempotency_key` | yes | Stable token the resolving surface echoes back so duplicate submissions can be detected and safely collapsed. |

If a choice needs operator-authored content, that content is carried as structured input attached to the chosen `choice_id`, not smuggled in free-form around the `awaiting` object. `question` and `nudge` therefore use the same primitive as `approval`: they differ only in choice schema and downstream effect.

## Resolution and idempotency rules

A resume request must include `await_id`, `choice_id`, any structured input required by that choice, and the current `idempotency_key`.

The runtime behavior is binding:

1. **First winning resolution applies the side effect exactly once.** Once a pending `await_id` resolves, the guarded action (delivery, rejection branch, role mutation, freeze continuation, ejection) is committed once and only once.
2. **Exact duplicates are acknowledgements, not second actions.** If the same `await_id` / `choice_id` / structured-input tuple is submitted again with the same `idempotency_key`, the runtime returns the already-recorded result and performs no new side effect.
3. **Conflicting second resumes are rejected.** If a different choice arrives after resolution, the runtime must return the already-recorded outcome and refuse the new one.
4. **Timeouts are explicit.** A timeout may resolve through `default_choice` if one exists; otherwise the `awaiting` state remains pending or is escalated as `timed_out`. There is no silent "best effort" branch.
5. **Supersession is explicit.** If a newer orchestration decision replaces an old pause, the old instance becomes `superseded` and remains in audit / replay. It is not deleted.
6. **Resume returns to the paused edge.** The run continues from the guarded boundary the `awaiting` state named; surfaces do not invent alternate post-resolution code paths.

These rules are the concurrency-safe core of the spec. ACP's `Await` and LangGraph's interrupt model both treat pause/resume as stateful runtime objects keyed by stable identity rather than as ambient chat messages; Kumite adopts the same discipline here.[^acp-await][^langgraph]

## Surface obligations

### Swift inspector (AK-14)

The Swift control room is the primary rich-resolution surface. Its inspector flow must:

1. Render the canonical `prompt`, `details`, and ordered `choices` for a selected `await_id`.
2. Show the paused `scope` so an operator can see which round / phase / agent is blocked.
3. Submit resolutions by `await_id` + `choice_id` + structured input + `idempotency_key`, never by surface-local action names.
4. Show resolved / timed-out / superseded status from the canonical record rather than inferring completion from UI dismissal.

### Discord lifecycle (AK-15)

Discord is the secondary approval and audit surface. Its lifecycle flow must:

1. Mirror the same `await_id`, `prompt`, and legal `choices` the Swift surface sees.
2. Treat buttons, menus, or slash-command actions as transport for canonical `choice_id` values, not as a separate approval model.
3. Record who resolved the `await_id`, with which `choice_id`, and when, so the Discord audit trail can be reconciled against the canonical artifact record.
4. Refuse actions for unsupported kinds rather than silently reinterpreting them. If Discord cannot express a choice's input schema, the surface must point the operator to Swift or another richer resolver.

The core invariant is that **Swift and Discord resolve the same object**. They may differ in ergonomics and density, but not in lifecycle semantics.

## Out of scope for this spec

- The detailed intervention event schema persisted in benchmark artifacts. AK-7 owns the wider intervention record shape; this spec owns the pause/resume contract feeding it.
- The exact UI layout, component hierarchy, or visual treatment of `awaiting` cards, sheets, alerts, and threads. AK-14 and AK-15 own those.
- Provider-specific implementation details inside any ACP server. This spec fixes the harness-facing contract, not server internals.

## Cross-references

- `phase-1-thesis.md`: fixes the "ACP as the control plane" rule this spec operationalises.
- `observation-vs-intervention.md`: fixes the C4/C5 discipline that constrains when human-resolved `awaiting` is legal.
- `v0-match-spec.md`: fixes the round / phase structure whose execution edges `awaiting` can pause.
- `benchmark-protocol.md`: consumes the intervention / resolution outcomes that this spec makes canonical.
- AK-14 (Swift control room) and AK-15 (Discord RBAC) must consume this lifecycle rather than inventing their own pause model.

[^thesis]: `docs/superpowers/specs/phase-1-thesis.md`.
[^obs-vs-int]: `docs/superpowers/specs/observation-vs-intervention.md`.
[^acp-await]: ACP Await mechanism: https://agentcommunicationprotocol.dev/how-to/await-external-response.md
[^langgraph]: LangGraph human-in-the-loop interrupts: https://docs.langchain.com/oss/python/langgraph/human-in-the-loop
