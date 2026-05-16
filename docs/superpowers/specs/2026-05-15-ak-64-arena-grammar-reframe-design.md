---
doc_type: spec
issue: AK-64
title: Reframe Live Ops and Replay around Arena grammar
date: 2026-05-15
status: approved
---

# AK-64 — Reframe Live Ops and Replay around Arena grammar

## Problem

`ArenaView` (AK-63) established a staged, broadcast-style presentation grammar:
a pressure-banded `ArenaMarquee`, a `CenterStageShell` pressure visual, a
dramatized `SpotlightBeatCard`, a sliding `EventTickerView`, a pressure-ranked
`CastLadderStrip`, a demoted `ArenaTransportBar`, all on `ControlRoomBackdrop`
with the state-driven `MotionSystem` primitives.

`LiveOpsView` and `ReplayLabView` ignore that grammar. They are generic
`MissionSection` / `MetricCardView` / `Table` dashboards. The product reads as
"one cinematic screen plus two telemetry panels" instead of one game.

## Governing principle (standing gate)

**The Arena, and every surface reframed around its grammar, must be more
dynamic and interesting than any conventional dashboard.** A correct-but-static
reframe is a failure. This is re-checked at *every* gate below — design, spec
review, plan review, code review, completion — with the explicit question:
*"Is this meaningfully more dynamic/interesting than a generic dashboard, or
did it collapse back toward static cards/tables?"* Flat layouts are treated as
a regression, not a neutral outcome.

## Goal

- Live Ops feels like **operating the same live match**, not a separate
  dashboard.
- Replay lands as **recap, scrub, and proof** in the same presentation
  language.
- Public events, private state, alerts, and interventions stay legible
  **without collapsing back into generic tables**.

## Architecture

### Decomposition (three cuts, strict order)

A single `ArenaGrammar.swift` was rejected on review: the real shared
dependency is the ~280-line `private extension LoadedProjection`, and bundling
it with the views just renames the god-file.

1. **`ProjectionPresentation.swift`** — *visibility-only, lands first.* Move
   `PressurePresentation`, `extension LoadedProjection`,
   `extension CallsheetRow`, and the `Array` helper extensions out of
   `ControlRoomScreens.swift`; flip `private` → `internal`. No behavior change;
   every existing symbol still resolves. This is the compile-prerequisite seam.
2. **`ArenaGrammar.swift`** — *mechanical cut, second.* The reusable Arena
   components and genuinely shared leaf views: `ArenaMarquee`,
   `CenterStageShell`, `SpotlightBeatCard`, `EventTickerView`,
   `CastLadderStrip`, `ArenaTransportBar`, `TagPillView`, `StatPillView`,
   `MetricCardView`, `MissionHeroHeader`, `MissionSection`,
   `LayerCountListView`, `PressureBannerView`, `PressureShellVisualView`,
   `ControlRoomBackdrop`. Verification: **Arena renders identically.**
3. **Per-screen split** — `ArenaView.swift`, `LiveOpsView.swift`,
   `ReplayLabView.swift` move to their own files. `CallsheetView`,
   `AftermathLedgerView`, `InspectorDetailView` stay in
   `ControlRoomScreens.swift`, **untouched** (their "Spectacle" idiom is out of
   scope).

Inverting steps 1 and 2 is the trap: moving a component before the
presentation layer is visible forces scattered `private`-removals in the same
commit as a view move.

### Pure, unit-tested decision helpers

Consistent with the existing `MotionSystem` discipline (`ShellContraction`,
`EventTickerWindow`, `ScrubDirection`, `BetrayalFlash`, `EventPulse`,
`CastEntrance`), all new derived presentation decisions are pure enums with
static functions, value-in/value-out, no `View`. They live next to the
existing helpers so the test target already imports them.

- `enum ArenaMode { case live, operating, recap }`
- `MarqueePresentation.eyebrow(mode:condition:) -> String`
- `MarqueePresentation.showsBeatCounter(mode:) -> Bool`
- `MarqueePresentation.showsSurvivorPill(mode:) -> Bool`
- `ArenaModeSelection.mode(forKind:matchStatus:) -> ArenaMode`
- `SpotlightSnapshotSelection.index(count:selected:) -> Int?` (clamped, mirrors
  `EventTickerWindow`/`PresentationState` clamp semantics)
- `TensionGauge.percent(forBand:) -> Int` (extracts the currently-untested
  string-matched `tensionPercent`)

### Marquee parameterization

`ArenaMarquee` does **not** take a `mode` that branches layout internally
(rejected on review — that recreates the genericity AK-64 kills). The screen
injects resolved data (eyebrow string, pill list, whether the beat counter /
survivor pill show). The mode→presentation decision is `MarqueePresentation`
(above). `ArenaMarquee` owns *how a marquee looks*; the screen owns *what it
says*.

`SpotlightBeatCard` folds its motion contract (`.id(marker.id)`,
`spotlightHandoff`, `replayScrub`, `betrayalFlash`) **inside the component**
with safe defaults (`scrub: .none`, `staged: true`), so reuse by Live Ops /
Replay cannot silently drop transition identity. Arena passes its
`scrubDirection`; other callers get correct static behavior for free.

`@Bindable` is dropped from transport components that never use a `$binding`
(`ArenaTransportBar`, and `ArenaView`'s decorative `@Bindable`); they take a
plain `let model`. `ControlRoomAppModel` remains the sole `PresentationState`
mutator via its existing funnel methods — no reused grammar component mutates
`presentation` directly.

## The reframe (full Arena vocabulary)

### Live Ops — `ArenaMode.live`, "operating the same live match"

- `ArenaMarquee`, eyebrow `LIVE · <condition>` — same broadcast header, pills
  for band / cursor / open awaits / active alerts. Reads as *the same room*.
- `CenterStageShell` — the same pressure-shell visual; the operator is watching
  the same match contract, not a parallel telemetry view.
- The four operator layers — **public stage**, **private whispers**, **alert
  rail**, **intervention rail** — become staged Arena rail cards (material +
  accent + pills + `castEntrance` staging), each surfacing its live edge as a
  headline read (latest beat / betrayal watch / room tone / open awaits), not
  table rows.
- The awaiting queue becomes actionable **spotlight-style cards** — the
  operator's focal work, inspectable via the existing `onInspect` →
  `InspectorItem.liveAwait` path.
- The live `EventTickerView` stays (it is the live chronology).
- Playback transport stays demoted; the operator rails sit above it.

### Replay Lab — `ArenaMode.recap`, "recap, scrub, proof"

- `ArenaMarquee`, eyebrow `RECAP · <condition>`, **no live beat counter**
  (`MarqueePresentation.showsBeatCounter(.recap) == false`).
- The selected marker drives a `SpotlightBeatCard` with `replayScrub` motion —
  the recap reel's focal beat.
- `EventTickerView` **becomes the scrubber**: selecting a beat scrubs the
  spotlight. The ticker *is* the timeline.
- The canonical snapshot is promoted into a spotlight **proof card**
  (`SpotlightSnapshotSelection`); remaining snapshots render as a horizontal
  Arena-card ladder. **No bordered `Table`.**
- Recap callouts (`betrayalCallouts`) render as Arena cards.
- Transport drives the scrub. The right Inspector stays the structured proof
  drill-down (`InspectorItem.marker` / `.snapshot`).

## Data flow

Unchanged. Screens read the immutable `LoadedProjection`; `ControlRoomAppModel`
owns `PresentationState` and the transport funnel; the new helpers are pure
functions over decoded values. No new state, no new ownership.

## Error / empty states

Preserve the existing `ContentUnavailableView` fallbacks: Live Ops with no
layered snapshot, Replay with no markers/snapshots, Arena idle. Restyle them on
`ControlRoomBackdrop` so empty states still read as the same product.

## Testing

- New `MotionSystem`-style suites in `AgentKumiteControlRoomTests` for every
  helper above. Prefer parameterized `@Test(arguments:)` (matches the existing
  idiom):
  - `MarqueePresentation`: each mode → expected eyebrow prefix; recap hides
    beat counter; live/operating show survivor pill; eyebrow embeds condition
    verbatim.
  - `ArenaModeSelection`: `.live`+"live" → `.live`; `.control`+nil → `.recap`;
    unknown `matchStatus` fallback.
  - `SpotlightSnapshotSelection`: empty → nil; no selection → latest
    (`count-1`); valid passes through; out-of-range / negative clamp.
  - `TensionGauge`: monotonic non-decreasing across bands (like
    `ShellContraction`).
  - `pressurePresentation` band thresholds (round/survivor cutoffs at the
    existing lines) — pure, currently untested; add now since two more screens
    will read it.
- Regression gate after step 2: `swift test` green and Arena visually
  unchanged.
- `swift build` (`npm run gui:build`) green after each step.

## Scope guards

- No `PresentationState` / `ControlRoomAppModel` changes.
- No new motion primitives — reuse `MotionSystem`.
- `CallsheetView` / `AftermathLedgerView` / their Spectacle idiom: untouched.
- `InspectorDetailView`: may move to its own file (hygiene) but not reworked.
- `PressureShellVisualView` / `RivalryWebView` geometry (incl. duplicated
  `rivalryPoints`): not refactored here.
- Cast-entrance lifetime stays per-screen one-shot. Model-owned-per-load is a
  noted possible follow-up, **out of scope**.

## Sequencing summary

1. `ProjectionPresentation.swift` (visibility only) — build green.
2. Helpers + tests in `MotionSystem.swift`.
3. `ArenaGrammar.swift` mechanical cut + `SpotlightBeatCard` motion fold —
   Arena renders identically, tests green.
4. Per-screen file split.
5. Live Ops reframe.
6. Replay reframe.
7. Version bump + resolve.

Each step is independently buildable; the reframe diffs (5, 6) stay small
because the shared surface is stable by step 4.
