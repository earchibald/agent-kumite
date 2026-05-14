---
title: "Agent Kumite — Thought-Trace Labeling Spec"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-09
locked_by: AK-4
supersedes: []
---

# Thought-Trace Labeling Spec

## Framing (binding)

> **Every visible reasoning trace surfaced through the Agent Kumite harness is labeled as agent-reported. Traces are never treated as ground truth about agent reasoning, and deception inference is computed from action-vs-commitment divergence (AK-7), not from trace contents.**

This is a locked decision, not a candidate. It operationalises REC-07 in `Agent Kumite.md`[^kumite-report] and `phase-1-thesis.md`[^thesis] Success Criterion 4 ("Reasoning is reported, not believed"). The literature pressure is clear: models can produce post-hoc rationalisations that don't reflect the actual process behind their outputs, can adapt their stated reasoning to perceived operator preference, and — at the limit — can present benign-looking traces while pursuing different goals.[^turpin][^sycophancy][^sleeper-agents] The spec's job is to fix the labels, field names, and operator-facing copy so a trace cannot reach an operator without the contract attached.

The constraint is one-directional: the harness MAY surface traces (with the labeling discipline below); it MUST NOT compute downstream deception or trustworthiness signal from trace contents. The signal layer derives from the structured commitments / action artifacts owned by AK-7.

## What counts as a thought trace

A **thought trace** is anything an agent emits that purports to describe its own reasoning, planning, reflection, or motivation. Concretely, in scope:

1. **ACP message-metadata trajectory entries** that surface as agent reflection or step narration.[^acp-metadata]
2. **Provider-side reasoning blocks** when the harness chooses to surface them: Anthropic extended-thinking content, OpenAI reasoning summaries, equivalent fields from other providers.
3. **Agent-authored private-channel reflections** — i.e. messages an agent emits to a private side-channel (logbook, scratch turn, plan note) that describe what the agent is doing or intends to do.
4. **Post-hoc explanations** attached to actions or commitments at the agent's own initiative ("I voted X because …").

Out of scope — these are **not** traces and are not governed by this spec:

- **Public events.** Match-visible utterances and structured commitments are public, contractual, and governed by AK-7. They are not "the agent's report of its reasoning"; they are first-class match state.
- **Tool calls and their arguments.** A tool invocation is an action, not a self-narrative. Tool-call payloads belong to AK-7 / AK-9.
- **Operator inputs.** Nudges, questions, and approvals (the C5 intervention surface — AK-3) are not traces.
- **Referee narration.** Anything the harness itself synthesises about the match (AK-8 grimoire, AK-11 tension director) is harness output, not agent output.

## Canonical field name and type

The labeling contract starts at the data-model boundary. There is exactly one canonical name for the agent's self-reported reasoning slice across every layer:

| Layer | Identifier |
| :--- | :--- |
| Vault frontmatter / on-disk JSON | `reported_reasoning` |
| ACP message-metadata key | `reported_reasoning` |
| Swift type | `ReportedReasoning` (struct) |
| Swift property on a containing model | `reportedReasoning` (camelCase, mapped to the snake_case key) |
| Discord embed field title | `Reported reasoning` |
| Replay artifact column / log key | `reported_reasoning` |

The `reported_` prefix is the load-bearing signal — it documents the epistemic status in the field name itself, so a downstream consumer reading a JSON payload or a Swift property without context still sees that this is what the agent *said* about its reasoning, not what its reasoning is.

### Banned aliases

The following identifiers are **banned** from the harness, the Swift control room, the Discord layer, and any replay artifact. A schema or code reviewer encountering one of these names in a PR has standing to block it on this clause alone:

- `thoughts`
- `thinking`
- `internal_state`
- `agent_thinking`
- `cot`
- `chain_of_thought`
- `reasoning` (bare — must carry the `reported_` prefix)
- `belief`
- `intent`
- `motivation`
- `mental_state`
- `mind`

The ban is by *connotation*, not by lexical pattern: each of these implies either (a) interior access we don't have (`internal_state`, `mind`, `mental_state`), or (b) ground truth about agent state (`thoughts`, `belief`, `intent`). The list is non-exhaustive — the principle ("does this name suggest the harness can see what the agent actually believes?") governs new cases as they come up.

## Typographic and prefix conventions

Every operator-facing surface that renders trace contents to a human MUST apply the conventions below. The conventions are deliberately uniform across surfaces so an operator reading a Swift drawer, a Discord embed, and a replay scrub-bar tooltip sees the same shape and learns to recognise "this is reported, not verified" pre-attentively.

### Prefix (plain-text contexts)

The textual prefix is `[reported]` — lowercase, square brackets, single token, no internal whitespace. It precedes the trace body, on the same line or the line above depending on rendering width. Plain-text contexts include: log dumps, Discord plain-text fallback, terminal rendering, replay export `.txt` / `.csv` cells, anywhere a rich container is unavailable.

The prefix is chosen to be greppable and to survive copy-paste. It is **not** a stylistic choice; downstream tooling may filter or aggregate by it.

### Label (rich UI contexts)

Rich UI contexts (Swift control room, Discord embeds, replay viewer drawer, referee grimoire) MUST carry one of two label forms on the trace container:

- **Long form:** `Agent-reported reasoning` — preferred when space allows (drawer headers, embed titles).
- **Short form:** `Reported reasoning` — when constrained (sidebar pills, badge chips).

The label appears on the chrome of the container (header, pill, badge), not blended into the trace body. The body still carries the `[reported]` prefix in any plain-text export of the same data.

### Visual treatment

The default visual treatment is **italic body in a visually distinct container** — a sidebar pill, drawer, blockquote, or callout. The treatment must:

- be visually distinct from public events / commitments / actions on the same surface, so an operator skimming cannot mistake a trace for a public utterance or a tool call;
- not blend into the public-event stream (no inline rendering in a chat-style scroll without container chrome);
- carry the label on its chrome.

Surfaces are free to pick concrete colors / iconography / animation within those constraints. Colour alone is not sufficient — the textual label and italic body together carry the contract; colour is decoration.

### Negative space

Surfaces MUST NOT:

- render a trace inline with public events as if it were one (i.e. no "agent X thought: …" in the same scroll position as "agent X said: …");
- summarise / paraphrase a trace such that the summary loses the `[reported]` prefix or the label;
- expose a trace via tooltip / hover-only without also rendering the label and prefix when the tooltip is opened;
- surface a trace in any operator workflow that does not expose a path to the citation blurb (next section).

## Mandatory citation blurb

Any operator-facing surface that exposes trace contents MUST expose the canonical citation blurb. The blurb is short by design — operators will see it repeatedly and must read it through.

### Canonical text

> Agent-reported reasoning. These are the agent's own statements about its reasoning; they are **not** evidence of the agent's actual reasoning. Models can produce post-hoc rationalisations that don't reflect the process behind their outputs (Turpin et al., 2023[^turpin]) and adapt their stated reasoning to perceived operator preference (Sharma et al., 2023[^sycophancy]). Use action-vs-commitment divergence (AK-7), not trace contents, for deception inference.

### Reach and cadence

Surfaces may wrap this in a tooltip / drawer / footnote / Discord embed but **cannot edit the text**. Surfaces own the *cadence*: each operator-facing surface MUST guarantee the blurb has reached the operator at least once per session-of-use, before the operator's first trace read of that session — not buried three menus deep.

Examples of compliant placements:

- A Swift control-room session opens with the blurb visible in the trace drawer the first time the drawer is opened, with a "I've read this" dismissal that resets each session.
- A Discord channel that mirrors traces pins the blurb as a channel-topic or a sticky message that the bot re-stickies on disturbance; channels that surface traces ad-hoc include the blurb as the first line of the embed.
- A replay viewer renders the blurb in the trace-drawer header on first open of the drawer in the viewer's lifetime (per-session is acceptable; permanent dismissal is not).
- Plain-text exports (`.txt`, `.csv`, `.json`) include the blurb as a header comment when the export is intended for human reading. Machine-readable exports omit the blurb but MUST use the canonical field name.

### Anti-patterns

- Rendering the blurb in a settings page that an operator never visits during normal work.
- Replacing the blurb with a paraphrase ("These are model thoughts, take with a grain of salt").
- Rendering the blurb only on the very first session a user ever has, and then suppressing it. (Per-session reach is the requirement.)
- Stamping the blurb on every individual trace card. (Reach, not redundancy. Surfaces SHOULD avoid blurb fatigue by surfacing it once per session-of-use rather than on every card.)

## Where this applies

| Surface | Spec | Affected scope |
| :--- | :--- | :--- |
| Swift control room | AK-14 | trace drawer, trajectory view, intervention preview when a nudge/approval references trace content |
| Layered UI separation | AK-13, `docs/superpowers/specs/layered-ui.md` | the "private state" layer that owns trace surfacing, distinct from public events / alerts / interventions |
| Discord layer | AK-15 | any channel that mirrors trace contents to operators; RBAC governs who sees the channel, this spec governs how the contents render |
| Referee grimoire | AK-8 | god-view rendering of trace contents alongside public events and structured commitments — the grimoire MUST keep traces in their own visually-distinct container |
| Replay artifacts | downstream of AK-14 | scrubbing, drill-down, export — same prefix / label / blurb rules apply |
| Structured commitments / payload schemas | AK-7 | `reported_reasoning` is the canonical field name for the self-narrative slice within whatever message / metadata envelope AK-7 specifies |
| Benchmark protocol | AK-6 | per-run trace tagging uses the canonical field name; trace contents are NOT used as features in primary deception metrics — divergence (AK-7) is the source of truth |

Internal storage, ACP transit, and benchmark-pipeline consumption are **not operator-facing** and do not need to render the blurb (but MUST use the canonical field name).

## Out of scope for this spec

- **Per-provider reasoning extraction.** Belongs to AK-7. The spec governs harness-side labeling; provider drift (Anthropic extended-thinking format changes, etc.) is absorbed by AK-7's per-provider mapping, not by editing this spec.
- **C4-vs-C5 affordances around traces.** Belongs to `observation-vs-intervention.md` (AK-3). Whether an operator can intervene in response to a trace is governed by C5 affordances; this spec governs how the trace renders regardless.
- **Empirical detection of unfaithful CoT.** Belongs to AK-6 (benchmark protocol). The spec asserts traces are not ground truth as a *labeling contract*; whether models are *in fact* unfaithful in a given run is a separate measurement.
- **Prompt-level instructions to agents about their own reasoning.** Out of phase-1 scope. The harness does not vary agent-side prompts about reasoning honesty within phase-1's gating matrix.
- **The structured-commitment payload schema.** Belongs to AK-7. This spec only fixes the field name (`reported_reasoning`) and the banned aliases.
- **Per-channel UI design.** Surfaces (AK-13 / AK-14 / AK-15) own concrete typography, iconography, and cadence within the constraints above.

## Cross-references

- `Agent Kumite.md` §5 (Evaluation Harness): Success Criterion 4's anchor in the report; trace artifacts are first-class but not signal-bearing for deception.
- `phase-1-thesis.md`: Success Criterion 4 ("Reasoning is reported, not believed"); pointer-table row for "Thought-trace labeling" cites this spec.
- `observation-vs-intervention.md` (AK-3): cites Turpin / Sharma / Sleeper-Agents in the context of why C4 read-only inspection cannot rely on traces; consistent with this spec's framing without redefining it.
- AK-6 (benchmark protocol) — consumes the canonical field name; does not consume trace contents as primary deception features.
- AK-7 (structured commitments) — owns the message / metadata envelope that nests `reported_reasoning`, and owns the action-vs-commitment divergence metric this spec defers to.
- AK-8 (referee grimoire) — surfaces traces in the god-view alongside public events and commitments, MUST keep traces in their own visually-distinct container per the typographic conventions above.
- AK-13 / AK-14 / AK-15 — own the surfaces that enforce phase-1 affordance gating and trace rendering; this spec governs the rendering, AK-3 governs the affordances.
- AK-9 (work layer) — task outputs are actions, not traces; this spec confirms the boundary.

[^kumite-report]: `agent-researchers/agent-kumite/Agent Kumite.md` — the long-form research report. REC-07 is in §"Recommendation Task List".
[^thesis]: `agent-kumite/docs/superpowers/specs/phase-1-thesis.md` — Phase-1 Thesis (locked by AK-2). Success Criterion 4 names "Reasoning is reported, not believed".
[^acp-metadata]: ACP message metadata including trajectory payloads: https://agentcommunicationprotocol.dev/core-concepts/message-metadata.md
[^turpin]: Turpin et al., "Language Models Don't Always Say What They Think: Unfaithful Explanations in Chain-of-Thought Prompting": https://arxiv.org/abs/2305.04388
[^sycophancy]: Sharma et al., "Towards Understanding Sycophancy in Language Models": https://arxiv.org/abs/2310.13548
[^sleeper-agents]: Hubinger et al., "Sleeper Agents: Training Deceptive LLMs that Persist Through Safety Training": https://arxiv.org/abs/2401.05566
