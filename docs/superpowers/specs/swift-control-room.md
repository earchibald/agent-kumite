---
title: "Agent Kumite — Swift Control Room Spec"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-13
locked_by: AK-14
supersedes: []
---

# Swift Control Room Spec

## Framing (binding)

> **The Swift control room is Agent Kumite phase 1's primary operator surface: a desktop-first, five-screen cockpit that renders canonical match state, ingests ACP as the control plane, preserves AK-13's layer separation, consumes AK-12's `awaiting` lifecycle without inventing a surface-local pause model, and persists replayable snapshots plus markers so every live decision can be replayed and audited.**

This is a locked decision, not a candidate. It operationalises REC-09 in `Agent Kumite.md` and the phase-1 thesis row for "Swift control room".[^kumite-report][^thesis] The spec's job is to fix four things before implementation starts:

1. **The MVP screen set.** What the Swift app must ship in phase 1: Arena Control Room home, cast callsheet, live-ops, replay lab, and aftermath ledger.
2. **The canonical state model.** Which persisted records and derived projections the app owns, and which ones remain downstream views over benchmark artifacts.
3. **The ingestion boundary.** Swift speaks ACP-backed Kumite state, not provider SDKs or direct model credentials.[^acp-openapi][^acp-await][^acp-metadata]
4. **The replay contract.** How live state becomes scrubbable history without forking away from the benchmark artifact bundle.

The control room is not a separate product from the harness. Per the phase-1 thesis, the show surface is downstream of canonical state, replay is a recap rather than a log dump, and operator actions must remain ACP-expressible.[^thesis] If Swift needs state or controls that the canonical artifact bundle cannot persist, that is a harness bug or a thesis violation, not a reason to invent Swift-only state.

## Why Swift is the primary dense surface

AK-13 already fixes the per-layer ownership rule: Swift is primary for private-state inspection, alert handling, and intervention-queue work, while Discord is secondary for punctuated approvals and notifications.[^layered-ui] AK-12 fixes the intervention object itself: Swift resolves canonical `awaiting` records rather than inventing modal-local pause semantics.[^awaiting] AK-3 fixes the condition boundary: C4 remains read-only and C5 exposes only `question`, `nudge`, and `approval`, with `role_change`, `freeze`, and `ejection` rendered as disabled placeholders in phase 1.[^obs-vs-int]

That makes Swift the place where phase 1's dense operator work belongs:

1. **Continuous watch surface.** Public chronology, alert status, and queue health can remain open simultaneously.
2. **Privileged drill-down.** DMs, structured commitments, `reported_reasoning`, and divergence detail can live in an inspector without leaking into spectator-facing context.
3. **Structured intervention resolution.** `await_id` selection, payload review, and one-shot resume belong in the same dense desktop shell, not in a notification stream.
4. **Replay and aftermath.** Phase-by-phase scrub, marker jumps, and post-match ledger work are richer than a notification surface should be.

## Screen shell and navigation contract

The app shell is locked to a **two-column** `NavigationSplitView` plus an inspector.[^swift-navsplit][^swift-inspector] This is not a mere layout preference; it encodes the operating model:

- **Leading column** selects the active destination (`home`, `callsheet`, `liveOps`, `replayLab`, `aftermathLedger`) and the current run.
- **Primary column** renders the selected screen's main table, timeline, or workspace.
- **Inspector** is the trailing drill-down surface for private-state detail, `awaiting` payloads, replay detail, and record inspection. In horizontally regular layouts it behaves like a trailing column; in compact layouts it adapts to a sheet rather than remaining simultaneously visible beside the primary content.[^swift-inspector]

Two supporting SwiftUI primitives are binding:

1. **`Table` is the canonical dense roster / ledger surface.** Cast callsheet and aftermath ledger are multi-column, selectable views over structured rows; they are not free-form card mosaics by default.[^swift-table]
2. **`inspector(isPresented:content:)` is the canonical drill-down surface.** Private-state detail, trace inspection, and `awaiting` resolution payloads live in the inspector. In compact size classes the inspector may adapt to a sheet, which means drill-down remains available but no longer stays visible alongside the primary timeline.[^swift-inspector]

Two implementation obligations follow from the cited APIs:

1. **Compact focus is explicit state, not an automatic guarantee.** `NavigationSplitView` chooses the compact stack's top column unless the app tracks and updates `preferredCompactColumn`; Swift must therefore keep the operator's current focus in shell state and drive compact collapse intentionally rather than assuming the API preserves the right screen automatically.[^swift-navsplit]
2. **Compact table fallback is real.** In compact horizontal layouts, `Table` can hide headers and collapse to its first column, so the first column of callsheet and ledger tables must carry the canonical identity and highest-value summary for the row.[^swift-table]

The product remains desktop-first. Regular/horizontally expanded layouts are where simultaneous live-ops visibility guarantees apply; compact layouts preserve reachability, not full side-by-side density.

## MVP screens

The phase-1 screen set is fixed at five destinations:

| Screen | Primary job | Canonical inputs | Default layers in view | Core interactions |
| :--- | :--- | :--- | :--- | :--- |
| **Arena Control Room home** | Match directory and launchpad into live or replay work | Run manifest (#1), roster summary (#3), alert counts, open `awaiting` counts, latest markers | Summary cards plus alert/queue counts | Select active run, jump to live-ops, jump to replay marker, open latest aftermath |
| **Cast callsheet** | Dense roster view for one run | Roster (#3), life state, role, score deltas (#10), current alliance/commitment summaries (#5), alert badges | Public summary + selected private detail in inspector | Sort, filter, multi-select, inspect one agent's DMs/trace/commitments |
| **Live-ops** | Operate an active run without mixing layers | Public events (#4), private artifacts (#5–#7), open `awaiting` items (#9 + AK-12), alerts, scores (#10) | All four AK-13 layers, with simultaneous visibility required in regular layouts | Watch timeline, inspect private state, acknowledge alerts, resolve `awaiting` in C5 |
| **Replay lab** | Phase/event scrub, compare, recap, and bookmark | Replay bundle (#2), full artifacts (#4–#10), snapshots, markers | Historical projections of the same four layers | Scrub by round/phase/event, jump to marker, diff snapshots, inspect historical payloads |
| **Aftermath ledger** | Post-match summary, scoring, betrayal, and operator-action review | Final scores (#10), commitments (#5), task outputs (#8), interventions (#9), marker rollups | Summaries first, drill-down second | Sort rows, pivot between score / betrayal / intervention reads, jump to replay proof |

### Arena Control Room home

Home is the top-level index, not the live match itself. It answers:

1. What runs exist right now?
2. Which one needs attention?
3. Which completed run is worth replaying next?

The home screen must show, at minimum, one card or row per active/recent run with:

- condition (`C1`-`C5` / `C4*`);
- current round / phase;
- roster size and surviving-agent count;
- active alert count and most severe unresolved alert;
- open `awaiting` count;
- latest high-salience replay marker.

Home is allowed to summarize, but not to become the permanent home of any underlying fact. Alerts still belong to the alert layer, `awaiting` items still belong to the intervention queue, and public chronology still belongs to the live/replay timelines.[^layered-ui]

### Cast callsheet

The callsheet is the roster-centric working view. It is the dense answer to AK-10's cast requirement, but without taking ownership of the roster schema itself.

Each row must carry at least:

- stable agent id and display name;
- model-family badge / seat / role motif;
- alive / eliminated / frozen-placeholder state;
- current score total and latest round delta;
- current round commitment status;
- current alert / `awaiting` badges.

The primary view is a `Table` so operators can sort by score, role, badge, alert status, or survival state.[^swift-table] The first column must carry the row's canonical identity plus enough status to survive compact-column collapse. Selecting a row opens the inspector with private-state detail, including DMs, commitment history, divergence clues, and labeled `reported_reasoning` if present. The callsheet never inlines raw private payload into the main table.

### Live-ops

Live-ops is the canonical active-match cockpit. It must preserve AK-13's four-layer separation visually and behaviorally:

1. **Public stream** — round / phase chronology, public square utterances, reveals, eliminations, score changes, and public replay markers.
2. **Private state** — DMs, unrevealed commitments, analyst privileged reads, trace payloads, referee-only diagnostics, and divergence drill-down.
3. **Alerts** — sparse state-transition objects that point back to their source layer.
4. **Intervention queue** — open `awaiting` items plus disabled future-condition placeholders.

The live-ops screen owns the phase-1 affordance discipline:

- In **C4**, the queue renders no enabled intervention forms and any `awaiting` records resolve through their default branch or remain observational only.[^obs-vs-int][^awaiting]
- In **C5**, only `question`, `nudge`, and `approval` may appear as actionable items. `role_change`, `freeze`, and `ejection` appear only as disabled placeholders with explicit phase-1 labeling.[^obs-vs-int]
- Alerts may point to queue items or private drill-down, but cannot become the permanent home of those details.[^layered-ui]

### Replay lab

Replay lab is the historical twin of live-ops: same canonical state, different time cursor. It exists because benchmark-grade runs must be replayable from artifacts, not because Swift wants its own proprietary replay format.[^benchmark]

Replay lab must support:

1. **Round / phase / event scrubbing.** The replay cursor can stop at round, phase, or event granularity.
2. **Marker jumps.** Operators can jump to eliminations, reveals, betrayals, alert escalations, `awaiting` opens/resolutions, and operator bookmarks.
3. **Historical inspectors.** Selecting an event or marker opens the inspector on the historical payload, not the current live state.
4. **Snapshot diff.** The operator can compare two snapshots to answer "what changed?" without manually replaying every intermediate event.

Replay is not permitted to reveal private payload in the public stream just because the run is over. The same layer discipline applies historically; replay simply makes every layer scrub-ready.

### Aftermath ledger

Aftermath ledger is the post-match structured review surface. It is not just a prettier score table. Its job is to make the phase-1 questions legible after the run closes:

- who survived and why;
- where commitment/action divergence clustered;
- how task quality, score, and alliance behavior lined up;
- what interventions occurred and whether they mattered;
- which moments deserve replay review.

The ledger is a `Table`-first screen over durable rows: agents, alliances, interventions, betrayal candidates, and match-level outcomes.[^swift-table] Each row links back to the replay marker or snapshot that proves it.

## Layer ownership and density thresholds

The layer split is inherited from AK-13 and is non-negotiable.[^layered-ui] What AK-14 locks additionally is **density behavior by active-agent count**:

| Active-agent count | Callsheet density | Live-ops density | Replay / aftermath density |
| :--- | :--- | :--- | :--- |
| **`<= 8`** | Full-fidelity rows or cards may show badge, role, life state, score, and alert badges simultaneously. This is the phase-1 happy path because v0 runs only six agents.[^match-spec] | In regular horizontal layouts, public stream, alert rail, intervention queue, and one inspector may remain visible together. | Per-agent rows and per-event markers may all stay visible at once. |
| **`9-20`** | Table-first. Only one selected row may expand into rich detail; secondary badges compress to chips. | One primary timeline plus collapsible side panels. Alerts and queue items batch by concern rather than rendering one always-open panel per agent. | Replay defaults to grouped markers and one selected-agent drill-down; aftermath defaults to sortable summary rows. |
| **`> 20`** | Search / filter / grouping first. Simultaneous full-cast detail is forbidden; operators select cohorts or one agent at a time. | Aggregate counters, incident clusters, and top-N attention lists replace full simultaneous roster visibility. Private detail is always on-demand. | Replay and aftermath default to cohorts, histograms, and grouped incidents; per-agent detail is entered explicitly. |

These three bands are locked. Styling may change, but the threshold boundaries may not silently drift. The reason is operational, not aesthetic: once density crosses the `<= 8` band, the UI must stop pretending it can show everything at once and force explicit selection.

These bands do **not** override size-class behavior. Compact horizontal layouts are an orthogonal fallback: tables may collapse to their first column and the inspector may present as a sheet, so the phase-1 guarantee there is that every layer remains reachable with stable semantics and ids, not that all live surfaces remain concurrently visible.

## Canonical state model

Swift owns one canonical control-room state graph per run, plus one global shell state for navigation. The control-room graph is conceptually:

```json
{
  "shell": {
    "selectedScreen": "liveOps",
    "selectedRunID": "run_456",
    "selectedAgentIDs": ["saboteur-1"],
    "inspectorSelection": null,
    "preferredCompactColumn": "content"
  },
  "runs": {
    "run_456": {
      "manifest": {},
      "roster": [],
      "publicEvents": [],
      "privateArtifacts": {},
      "alerts": [],
      "awaitingQueue": [],
      "replay": {
        "cursor": {},
        "snapshots": [],
        "markers": []
      },
      "aftermath": {}
    }
  }
}
```

The persisted and derived record types are locked as follows:

| Record | Kind | Canonical source | Why it exists |
| :--- | :--- | :--- | :--- |
| `RunManifest` | persisted | Artifact #1 | Names the run, condition, seed, revision, validity, and config. |
| `RosterEntry` | persisted | Artifact #3 | Stable agent identity, role, model badge, seat, and memory setting. |
| `PublicEvent` | persisted | Artifact #4 (ordered in Artifact #2) | Phase-ordered public chronology and visible beats. |
| `PrivateArtifact` | persisted | Artifacts #5, #6, #7 | Commitments, DMs, privileged reads, trace slices, referee diagnostics. |
| `AwaitRecord` | persisted | Artifact #9 + AK-12 payload | Canonical human-oversight object keyed by `await_id`; never surface-local. |
| `AlertRecord` | derived-but-persistable | Source-layer state transitions | Sparse attention object that points back to its source record. |
| `ReplaySnapshot` | persisted | Artifact #2 replay bundle | Fast reconstruction checkpoints for scrub and diff. |
| `ReplayMarker` | persisted | Artifact #2 replay bundle | Named jump points for recap, alert review, and proof links. |
| `AftermathRow` | derived | Artifacts #4, #5, #6, #8, #9, #10 | Post-match ledger rows for score, betrayal, task, survival, and intervention review. |

Two invariants govern the whole model:

1. **Artifacts stay authoritative.** If a view needs data that cannot be traced back to artifacts #1-#10, it is not benchmark-grade state. Replay snapshots and markers are part of Artifact #2, not a Swift-only side store.[^benchmark]
2. **Derived projections are never the only home of a fact.** Callsheet rows, alert cards, queue summaries, and aftermath rows are projections. Their source record remains authoritative and linkable.

## ACP ingestion strategy

The ingest boundary is locked to ACP-backed Kumite envelopes, not direct provider traffic.[^acp-openapi][^acp-await][^acp-metadata] Swift may talk to a harness gateway or orchestration layer that already normalized provider differences, but it must not build product behavior around provider-specific APIs, tokens, or OAuth.

The ingest pipeline is:

1. **Receive ACP-aligned state envelopes.** Every live update arrives tagged with stable ids (`match_id`, `run_id`, `agent_id`, `phase`, `timestamp`, and any `await_id` / message metadata).
2. **Normalize into artifact-backed records.** The ingest layer maps each envelope into one or more canonical records: public event, private artifact, `awaiting` update, score delta, or replay marker candidate.
3. **Append before projecting.** Persist the canonical record into the run store first; only then update live projections like callsheet rows, alert badges, queue state, or inspector content.
4. **Trigger replay bookkeeping.** On phase boundaries and other significant transitions, write a snapshot and/or marker.
5. **Render projections.** The screen state recomputes from the updated run store.

The control room must tolerate multi-session matches explicitly. Per the thesis, one Kumite match may span multiple ACP runs/sessions; Swift owns the composition layer that groups them under one run-centric control-room state, but it still treats ACP as the integration boundary rather than tunneling through to providers.[^thesis]

## Replay persistence, snapshot cadence, scrub, and markers

Replay is a persistence contract, not just a UI feature. Artifact #2 is the replay bundle: ordered timeline indexing plus persisted snapshots and markers sufficient to reconstruct the run together with the rest of the artifact store.[^benchmark]

### Snapshot cadence

`ReplaySnapshot` cadence is locked to:

1. **Match start** (before round 1 phase 1 renders).
2. **Every phase boundary** in the v0 nine-phase loop.[^match-spec]
3. **Any `awaiting` lifecycle transition** (`pending` -> `resolved` / `timed_out` / `superseded`) that occurs between normal phase boundaries.[^awaiting]
4. **Any score-affecting outcome** not already captured by a phase boundary snapshot.
5. **Operator-created bookmarks** when the operator explicitly marks a moment for later replay.

Snapshots are full-enough reconstruction checkpoints: roster state, life state, public timeline cursor, private-artifact cursor, alert set, intervention queue state, score state, and selected derived summaries. Between snapshots, Swift persists ordered event deltas rather than fresh full copies.

### Scrub contract

Scrub granularity is locked to three levels:

| Level | Meaning | Reconstruction rule |
| :--- | :--- | :--- |
| **Round** | Jump to the start or end of a round | Load nearest prior snapshot, apply deltas to round boundary |
| **Phase** | Jump to a v0 phase boundary | Load nearest prior snapshot, apply deltas to phase boundary |
| **Event** | Jump to a single event or `awaiting` transition | Load nearest prior snapshot, apply deltas to exact event index |

The replay cursor never mutates canonical history. Historical inspectors resolve against the replay cursor and selected record id; they do not overwrite live inspector state.

### Marker taxonomy

`ReplayMarker` kinds are locked to at least:

- `round_open`
- `reveal`
- `elimination`
- `score_delta`
- `betrayal_candidate`
- `alert_enter`
- `alert_escalate`
- `await_open`
- `await_resolved`
- `operator_bookmark`

Markers are sparse and named. They exist so the operator can answer "jump me to the decisive moment" without replaying the whole run. Every marker must point to a canonical record id and replay cursor position; no marker is pure prose.

## `awaiting` lifecycle in Swift

Swift does not invent its own pause model. It consumes AK-12's canonical `await_id` payload and resolves it via `await_id` + `choice_id` + structured input + `idempotency_key`.[^awaiting]

Swift therefore owes four concrete behaviors:

1. **Queue truthfulness.** Open `awaiting` items appear exactly once in the intervention queue.
2. **Inspector fidelity.** Selecting a queue item shows the canonical `prompt`, `details`, `choices`, paused `scope`, and current status.
3. **Idempotent resolution.** The UI submits the runtime's canonical identifiers, not local action names.
4. **Historical traceability.** Resolved, timed-out, and superseded outcomes remain replay-visible and aftermath-visible.

Condition gating is also fixed:

- **C4:** no live resolution controls.
- **C5:** `question`, `nudge`, and `approval` only.
- **Future-condition placeholders:** `role_change`, `freeze`, and `ejection` visible but disabled in phase 1.[^obs-vs-int]

## Out of scope, with pointers

| Topic | Tracked in |
| :--- | :--- |
| Match rules, round loop, elimination timing, score math | `docs/superpowers/specs/v0-match-spec.md`, AK-5 |
| Benchmark artifact semantics and reporting obligations | `docs/superpowers/specs/benchmark-protocol.md`, AK-6 |
| Structured commitment schema and intervention record schema | AK-7 |
| Referee grimoire / god-view | AK-8 |
| Task corpus contents and task rubrics | AK-9 |
| Roster identity schema and cast motifs | AK-10 |
| Tension / pressure cues | `docs/superpowers/specs/tension-director.md`, AK-11 |
| `awaiting` payload / resolution semantics | `docs/superpowers/specs/awaiting-human-nudge-state.md`, AK-12 |
| Layer routing rules | `docs/superpowers/specs/layered-ui.md`, AK-13 |
| Discord secondary approval / notification surface | AK-15 |

## Cross-references

- `docs/superpowers/specs/phase-1-thesis.md`: fixes the benchmark-first / show-first / ACP framing this spec instantiates.[^thesis]
- `docs/superpowers/specs/v0-match-spec.md`: fixes the nine-phase loop, replay unit boundaries, and score timing this control room renders.[^match-spec]
- `docs/superpowers/specs/benchmark-protocol.md`: fixes the ten-artifact bundle and replay-validity obligation this screen model must not violate.[^benchmark]
- `docs/superpowers/specs/observation-vs-intervention.md`: fixes the C4/C5 gating and disabled phase-1 placeholder rule the live-ops screen must enforce.[^obs-vs-int]
- `docs/superpowers/specs/awaiting-human-nudge-state.md`: fixes the canonical `await_id` lifecycle Swift must consume.[^awaiting]
- `docs/superpowers/specs/layered-ui.md`: fixes the four-layer routing contract and primary-vs-secondary surface ownership consumed here.[^layered-ui]

[^kumite-report]: `agent-researchers/agent-kumite/Agent Kumite.md` — REC-09 ("Swift control-room spec: state model, ingestion, replay, MVP screens"), especially the phase-1 Swift app section referenced by existing locked specs.
[^thesis]: `docs/superpowers/specs/phase-1-thesis.md`.
[^match-spec]: `docs/superpowers/specs/v0-match-spec.md`.
[^benchmark]: `docs/superpowers/specs/benchmark-protocol.md`.
[^obs-vs-int]: `docs/superpowers/specs/observation-vs-intervention.md`.
[^awaiting]: `docs/superpowers/specs/awaiting-human-nudge-state.md`.
[^layered-ui]: `docs/superpowers/specs/layered-ui.md`.
[^acp-openapi]: ACP OpenAPI spec and run/session endpoints: https://agentcommunicationprotocol.dev/spec/openapi.yaml
[^acp-await]: ACP Await mechanism: https://agentcommunicationprotocol.dev/how-to/await-external-response.md
[^acp-metadata]: ACP message metadata including trajectory payloads: https://agentcommunicationprotocol.dev/core-concepts/message-metadata.md
[^swift-navsplit]: Apple SwiftUI `NavigationSplitView` documentation: https://docs.developer.apple.com/documentation/swiftui/navigationsplitview
[^swift-table]: Apple SwiftUI `Table` documentation: https://docs.developer.apple.com/documentation/swiftui/table
[^swift-inspector]: Apple SwiftUI `inspector(isPresented:content:)` documentation: https://docs.developer.apple.com/documentation/swiftui/view/inspector(ispresented:content:)
