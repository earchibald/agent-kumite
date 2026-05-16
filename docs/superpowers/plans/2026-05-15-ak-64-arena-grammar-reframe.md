# AK-64 Arena Grammar Reframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `LiveOpsView` and `ReplayLabView` to compose the AK-63 Arena presentation grammar — staged, motion-driven, broadcast-style — instead of generic dashboards, while keeping public events / private state / alerts / interventions legible.

**Architecture:** Three ordered cuts before any reframe: (1) move the presentation-derivation extensions to their own file with internal visibility; (2) extract pure tested decision helpers into `MotionSystem.swift`; (3) extract the shared Arena components into `ArenaGrammar.swift`. Then split screens to their own files and reframe Live Ops (`.live`) and Replay (`.recap`) on the shared grammar.

**Tech Stack:** Swift 6, SwiftUI (macOS), `@Observable`, Swift Testing (`@Test`), Swift Package Manager.

**Standing gate (check at every task review and at completion):** *Is this meaningfully more dynamic and interesting than a generic dashboard, or did it collapse back toward static cards/tables?* A correct-but-static result is a failure.

**Working directory:** worktree at `.claude/worktrees/ak-64-arena-grammar-reframe`, branch `worktree-ak-64-arena-grammar-reframe`. All paths below are relative to the repo root.

**Build/test commands:**
- Build: `swift build --package-path apps/control-room`
- Test: `swift test --package-path apps/control-room`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `apps/control-room/Sources/AgentKumiteControlRoom/MotionSystem.swift` | Pure, tested motion + presentation decision helpers | Modify (add helpers) |
| `apps/control-room/Sources/AgentKumiteControlRoom/ProjectionPresentation.swift` | `PressurePresentation` + derived presentation properties on the projection models | Create (moved from `ControlRoomScreens.swift`) |
| `apps/control-room/Sources/AgentKumiteControlRoom/ArenaGrammar.swift` | Reusable Arena grammar views + shared leaf views | Create (moved from `ControlRoomScreens.swift`) |
| `apps/control-room/Sources/AgentKumiteControlRoom/ArenaView.swift` | The Arena spectator screen | Create (moved) |
| `apps/control-room/Sources/AgentKumiteControlRoom/LiveOpsView.swift` | Live Ops screen, reframed on Arena grammar | Create + reframe |
| `apps/control-room/Sources/AgentKumiteControlRoom/ReplayLabView.swift` | Replay screen, reframed on Arena grammar | Create + reframe |
| `apps/control-room/Sources/AgentKumiteControlRoom/ControlRoomScreens.swift` | `CallsheetView`, `AftermathLedgerView`, `InspectorDetailView` only — untouched idiom | Modify (shrink only) |
| `apps/control-room/Tests/AgentKumiteControlRoomTests/AgentKumiteControlRoomTests.swift` | Unit tests | Modify (add suites) |

---

## Task 1: Pure pressure/tension helpers

Extracts the two currently-untested derived decisions (`pressurePresentation` band thresholds, `tensionPercent` string-match) into pure helpers next to the existing `MotionSystem` enums.

**Files:**
- Modify: `apps/control-room/Sources/AgentKumiteControlRoom/MotionSystem.swift` (append after `enum EventPulse { … }`, before `// MARK: - SwiftUI primitives`)
- Test: `apps/control-room/Tests/AgentKumiteControlRoomTests/AgentKumiteControlRoomTests.swift`

- [ ] **Step 1: Write the failing tests**

Append to `AgentKumiteControlRoomTests.swift` (end of file, after the last `struct … Tests`):

```swift
struct PressureBandSelectionTests {
    @Test("Knife-edge when field is compressed or late round", arguments: [
        (2, 1), (1, 4), (4, 5), (3, 6),
    ])
    func knifeEdge(surviving: Int, round: Int) {
        #expect(PressureBandSelection.band(survivingAgentCount: surviving, round: round) == .knifeEdge)
    }

    @Test("Pressurized at the mid thresholds")
    func pressurized() {
        #expect(PressureBandSelection.band(survivingAgentCount: 3, round: 1) == .pressurized)
        #expect(PressureBandSelection.band(survivingAgentCount: 5, round: 3) == .pressurized)
    }

    @Test("Tightening from round two, Open before that")
    func tighteningAndOpen() {
        #expect(PressureBandSelection.band(survivingAgentCount: 6, round: 2) == .tightening)
        #expect(PressureBandSelection.band(survivingAgentCount: 6, round: 1) == .open)
    }

    @Test("Band severity is monotonic non-decreasing as the room tightens")
    func monotonic() {
        let order: [PressureBand] = [.open, .tightening, .pressurized, .knifeEdge]
        func rank(_ b: PressureBand) -> Int { order.firstIndex(of: b)! }
        var previous = 0
        for round in 1...6 {
            let current = rank(PressureBandSelection.band(survivingAgentCount: 6, round: round))
            #expect(current >= previous)
            previous = current
        }
    }
}

struct TensionGaugeTests {
    @Test("Tension percent rises monotonically with the band", arguments: [
        (PressureBand.open, PressureBand.tightening),
        (.tightening, .pressurized),
        (.pressurized, .knifeEdge),
    ])
    func monotonic(lower: PressureBand, higher: PressureBand) {
        #expect(TensionGauge.percent(forBand: lower) < TensionGauge.percent(forBand: higher))
    }

    @Test("Tension percent stays within 0...100")
    func bounded() {
        for band in PressureBand.allCases {
            let pct = TensionGauge.percent(forBand: band)
            #expect(pct >= 0 && pct <= 100)
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `swift test --package-path apps/control-room`
Expected: FAIL — `cannot find 'PressureBandSelection' in scope` / `cannot find 'TensionGauge' in scope`.

- [ ] **Step 3: Add the helpers**

In `MotionSystem.swift`, immediately after the closing `}` of `enum EventPulse` and before `// MARK: - SwiftUI primitives`, insert:

```swift
// MARK: - Canonical pressure derivation (unit-tested)

enum PressureBandSelection {
    /// The canonical pressure band for the current room. Monotonic: a more
    /// compressed field or later round never produces a calmer band. This is
    /// the single decision behind `LoadedProjection.pressurePresentation`.
    static func band(survivingAgentCount: Int, round: Int) -> PressureBand {
        if survivingAgentCount <= 2 || round >= 5 { return .knifeEdge }
        if survivingAgentCount <= 3 || round >= 3 { return .pressurized }
        if round >= 2 { return .tightening }
        return .open
    }
}

enum TensionGauge {
    /// Tension readout (0...100) for the pressure band. Strictly increasing in
    /// band severity so the gauge always reads hotter as the room tightens.
    static func percent(forBand band: PressureBand) -> Int {
        switch band {
        case .open: 24
        case .tightening: 48
        case .pressurized: 72
        case .knifeEdge: 87
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `swift test --package-path apps/control-room`
Expected: PASS — `PressureBandSelectionTests` and `TensionGaugeTests` green, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/control-room/Sources/AgentKumiteControlRoom/MotionSystem.swift apps/control-room/Tests/AgentKumiteControlRoomTests/AgentKumiteControlRoomTests.swift
git commit -m "agent-kumite: add pure pressure-band/tension helpers (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Arena mode + marquee/snapshot helpers

The mode→presentation decisions that let one marquee serve three screens without layout-branching inside the view.

**Files:**
- Modify: `apps/control-room/Sources/AgentKumiteControlRoom/MotionSystem.swift` (append after the Task 1 block)
- Test: `apps/control-room/Tests/AgentKumiteControlRoomTests/AgentKumiteControlRoomTests.swift`

- [ ] **Step 1: Write the failing tests**

Append to `AgentKumiteControlRoomTests.swift`:

```swift
struct ArenaModeTests {
    @Test("Eyebrow prefix per mode keeps Arena reading LIVE", arguments: [
        (ArenaMode.operating, "LIVE · C4"),
        (.live, "LIVE OPS · C4"),
        (.recap, "RECAP · C4"),
    ])
    func eyebrow(mode: ArenaMode, expected: String) {
        #expect(MarqueePresentation.eyebrow(mode: mode, condition: "c4") == expected)
    }

    @Test("Recap hides the live beat counter and survivor pill")
    func recapHidesLiveChrome() {
        #expect(MarqueePresentation.showsBeatCounter(mode: .recap) == false)
        #expect(MarqueePresentation.showsSurvivorPill(mode: .recap) == false)
    }

    @Test("Live and operating keep live chrome", arguments: [ArenaMode.live, .operating])
    func liveKeepsChrome(mode: ArenaMode) {
        #expect(MarqueePresentation.showsBeatCounter(mode: mode))
        #expect(MarqueePresentation.showsSurvivorPill(mode: mode))
    }

    @Test("Mode selection: live projection with an open match runs live")
    func selectionLive() {
        #expect(ArenaModeSelection.mode(forKind: .live, matchStatus: "live") == .live)
    }

    @Test("Mode selection: control projection and unknown/closed status run recap", arguments: [
        (ProjectionKind.control, String?.none),
        (.control, "closed"),
        (.live, "closed"),
        (.live, String?.none),
    ])
    func selectionRecap(kind: ProjectionKind, status: String?) {
        #expect(ArenaModeSelection.mode(forKind: kind, matchStatus: status) == .recap)
    }
}

struct SpotlightSnapshotSelectionTests {
    @Test("Empty list has no spotlight")
    func empty() {
        #expect(SpotlightSnapshotSelection.index(count: 0, selected: nil) == nil)
        #expect(SpotlightSnapshotSelection.index(count: 0, selected: 3) == nil)
    }

    @Test("No selection spotlights the latest snapshot")
    func latest() {
        #expect(SpotlightSnapshotSelection.index(count: 5, selected: nil) == 4)
    }

    @Test("Selection passes through and clamps", arguments: [
        (2, 2), (0, 0), (-3, 0), (9, 4),
    ])
    func clamps(selected: Int, expected: Int) {
        #expect(SpotlightSnapshotSelection.index(count: 5, selected: selected) == expected)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `swift test --package-path apps/control-room`
Expected: FAIL — `cannot find 'ArenaMode' / 'MarqueePresentation' / 'ArenaModeSelection' / 'SpotlightSnapshotSelection' in scope`.

- [ ] **Step 3: Add the helpers**

In `MotionSystem.swift`, immediately after the `enum TensionGauge { … }` added in Task 1, insert:

```swift
// MARK: - Arena mode (unit-tested)

/// Which stance a screen takes on the same projection. The grammar is shared;
/// the mode only changes labeling and which live-only chrome shows — never the
/// layout branching inside a component.
enum ArenaMode: String, CaseIterable {
    /// `ArenaView` — staged spectator broadcast of a live match.
    case operating
    /// `LiveOpsView` — operating the same live match.
    case live
    /// `ReplayLabView` — after-the-fact recap and proof.
    case recap
}

enum MarqueePresentation {
    /// Marquee eyebrow, e.g. `LIVE · C4`. `operating` stays "LIVE" so the Arena
    /// header is unchanged from AK-63; `live` is the operator stance; `recap`
    /// is past-tense.
    static func eyebrow(mode: ArenaMode, condition: String) -> String {
        let prefix: String
        switch mode {
        case .operating: prefix = "LIVE"
        case .live: prefix = "LIVE OPS"
        case .recap: prefix = "RECAP"
        }
        return "\(prefix) · \(condition.uppercased())"
    }

    /// The live "Beat n / N" counter only makes sense while a match clock is
    /// running — recap is scrubbed, not tracked.
    static func showsBeatCounter(mode: ArenaMode) -> Bool {
        mode != .recap
    }

    /// "X still in" survivor pill is live-only.
    static func showsSurvivorPill(mode: ArenaMode) -> Bool {
        mode != .recap
    }
}

enum ArenaModeSelection {
    /// The mode a non-Arena screen runs in. A live projection whose match is
    /// still open is `.live`; everything else (benchmark/control, or a live
    /// projection whose match has closed) is `.recap`. `ArenaView` always
    /// passes `.operating` explicitly and does not use this.
    static func mode(forKind kind: ProjectionKind, matchStatus: String?) -> ArenaMode {
        if kind == .live, matchStatus?.lowercased() == "live" {
            return .live
        }
        return .recap
    }
}

enum SpotlightSnapshotSelection {
    /// Index of the snapshot to promote into the spotlight proof card. Falls
    /// back to the latest (last) snapshot when nothing is selected; clamps
    /// out-of-range selections; `nil` for an empty list. Mirrors
    /// `EventTickerWindow`/`PresentationState` clamp semantics.
    static func index(count: Int, selected: Int?) -> Int? {
        guard count > 0 else { return nil }
        guard let selected else { return count - 1 }
        return min(max(0, selected), count - 1)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `swift test --package-path apps/control-room`
Expected: PASS — all four new suites green.

- [ ] **Step 5: Commit**

```bash
git add apps/control-room/Sources/AgentKumiteControlRoom/MotionSystem.swift apps/control-room/Tests/AgentKumiteControlRoomTests/AgentKumiteControlRoomTests.swift
git commit -m "agent-kumite: add Arena mode + marquee/snapshot helpers (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Extract `ProjectionPresentation.swift` (visibility-only seam)

Move the presentation-derivation layer out of `ControlRoomScreens.swift` and make it `internal`, and route `pressurePresentation`/`tensionPercent` through the Task 1 helpers. No behavior change.

**Files:**
- Create: `apps/control-room/Sources/AgentKumiteControlRoom/ProjectionPresentation.swift`
- Modify: `apps/control-room/Sources/AgentKumiteControlRoom/ControlRoomScreens.swift` (delete the moved blocks)

- [ ] **Step 1: Create the new file with the moved declarations**

Create `ProjectionPresentation.swift`. Move — verbatim, do not rewrite — these declarations currently at the bottom of `ControlRoomScreens.swift`:
- `private struct PressurePresentation { … }` → change `private struct` to `struct`
- `private extension LoadedProjection { … }` → change `private extension` to `extension`
- `private extension CallsheetRow { … }` → change `private extension` to `extension`
- `private extension Array where Element == CallsheetRow { … }` → `extension Array where Element == CallsheetRow`
- `private extension Array where Element == String { … }` → `extension Array where Element == String`

File header:

```swift
import Foundation
import SwiftUI
```

(`SwiftUI` is required: `PressurePresentation.color` is a `Color` and `CallsheetRow.suspicionColor`/`statusColor` return `Color`.)

Within the moved `extension LoadedProjection`, replace the body of `var pressurePresentation: PressurePresentation` with a version that delegates the band decision to the Task 1 helper (keep the per-band headline/copy/color exactly as they are today):

```swift
    var pressurePresentation: PressurePresentation {
        switch PressureBandSelection.band(
            survivingAgentCount: home.survivingAgentCount,
            round: home.currentCursor.round
        ) {
        case .knifeEdge:
            return PressurePresentation(
                band: "Knife-edge",
                headline: "The room is at match point",
                copy: "Only the next decisive beat matters now: the field is compressed and the show layer should feel like it.",
                color: .red
            )
        case .pressurized:
            return PressurePresentation(
                band: "Pressurized",
                headline: "Betrayal and elimination are now live",
                copy: "Nomination thresholds are in play, reveal beats matter, and every replay pin should justify the rising pressure.",
                color: .orange
            )
        case .tightening:
            return PressurePresentation(
                band: "Tightening",
                headline: "The shell is closing",
                copy: "Space is shrinking. The control room should telegraph closing options before it reaches a decisive reveal.",
                color: .yellow
            )
        case .open:
            return PressurePresentation(
                band: "Open",
                headline: "The cast is still introducing itself",
                copy: "Early rounds should stay readable and quieter so later elimination and betrayal beats have room to land.",
                color: .blue
            )
        }
    }
```

Replace the body of `var tensionPercent: Int` with:

```swift
    var tensionPercent: Int {
        TensionGauge.percent(forBand: PressureBand(label: pressurePresentation.band))
    }
```

- [ ] **Step 2: Delete the moved blocks from `ControlRoomScreens.swift`**

In `ControlRoomScreens.swift`, delete the now-moved declarations: `private struct PressurePresentation`, `private extension LoadedProjection`, `private extension CallsheetRow`, `private extension Array where Element == CallsheetRow`, `private extension Array where Element == String`. Leave everything else byte-for-byte.

- [ ] **Step 3: Build**

Run: `swift build --package-path apps/control-room`
Expected: PASS — no errors. (If "cannot find … in scope", a referenced symbol is still `private`; confirm the access-control flips in Step 1.)

- [ ] **Step 4: Test (regression)**

Run: `swift test --package-path apps/control-room`
Expected: PASS — full suite green, including Task 1/2 suites. No behavior changed.

- [ ] **Step 5: Commit**

```bash
git add apps/control-room/Sources/AgentKumiteControlRoom/ProjectionPresentation.swift apps/control-room/Sources/AgentKumiteControlRoom/ControlRoomScreens.swift
git commit -m "agent-kumite: extract ProjectionPresentation.swift, route through helpers (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Extract `ArenaGrammar.swift` + parameterize the marquee

Move the shared Arena components and shared leaf views to their own file, parameterize `ArenaMarquee` on injected data, and fold `SpotlightBeatCard`'s motion contract inside the component. Arena must render identically.

**Files:**
- Create: `apps/control-room/Sources/AgentKumiteControlRoom/ArenaGrammar.swift`
- Modify: `apps/control-room/Sources/AgentKumiteControlRoom/ControlRoomScreens.swift` (delete moved views; update the Arena marquee/spotlight call sites — `ArenaView` is still in this file until Task 5)

- [ ] **Step 1: Create `ArenaGrammar.swift` and move the shared views**

Create the file with header `import SwiftUI`. Move these declarations out of `ControlRoomScreens.swift` verbatim, changing `private struct` → `struct` (internal) on each: `CenterStageShell`, `EventTickerView`, `CastLadderStrip`, `ArenaTransportBar`, `MissionHeroHeader`, `MissionSection`, `PressureBannerView`, `LayerCountListView`, `MetricCardView`, `TagPillView`, `StatPillView`, `ControlRoomBackdrop`, `PressureShellVisualView`. (Leave `CallsheetView`/`AftermathLedgerView`-only helpers — `ShellStrip`, `ShellPanel`, `RivalryWebView`, `CastSpotlightCard`, `InspectorSection`, `MissionHeroView` — in `ControlRoomScreens.swift`; they are not grammar.)

- [ ] **Step 2: Add the marquee pill model + parameterized `ArenaMarquee`**

In `ArenaGrammar.swift`, add (replacing the old `private struct ArenaMarquee` which was in `ControlRoomScreens.swift` — delete that old one):

```swift
/// One labeled capsule in a marquee pill row.
struct MarqueePill: Identifiable {
    let id = UUID()
    let text: String
    let color: Color
}

/// Broadcast-style header shared by Arena, Live Ops and Replay. The screen
/// injects what it says (eyebrow / headline / copy / pills); the grammar owns
/// only how it looks. No mode branching lives here.
struct ArenaMarquee: View {
    let eyebrow: String
    let headline: String
    let copy: String
    let accent: Color
    let pills: [MarqueePill]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Text(headline)
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .foregroundStyle(accent)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(copy)
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                ForEach(pills) { pill in
                    TagPillView(text: pill.text, color: pill.color)
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [accent.opacity(0.28), Color.black.opacity(0.12)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(.rect(cornerRadius: 20))
    }
}
```

- [ ] **Step 3: Fold the motion contract into `SpotlightBeatCard`**

Move `SpotlightBeatCard` into `ArenaGrammar.swift` as `struct SpotlightBeatCard` (internal). Add two defaulted inputs and apply the four modifiers inside `body` (they currently live at the `ArenaView` call site, lines 42-45). Replace the struct with:

```swift
/// The focal beat dramatized as a spotlight card. Owns its own motion
/// contract: a caller cannot reuse it and silently drop the scrub/handoff/
/// flash identity. Defaults keep static callers correct.
struct SpotlightBeatCard: View {
    let marker: ReplayMarker
    let projection: LoadedProjection
    var scrub: ScrubDirection = .none
    let onInspect: () -> Void

    private var isReveal: Bool {
        BetrayalFlash.isTriggered(byMarkerType: marker.markerType)
    }

    var body: some View {
        Button(action: onInspect) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: isReveal ? "bolt.fill" : "sparkle.magnifyingglass")
                        .font(.title2)
                        .foregroundStyle(projection.pressurePresentation.color)
                    Text((isReveal ? "Reveal · " : "Spotlight · ")
                        + marker.markerType.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.headline)
                    Spacer()
                    TagPillView(text: marker.cursor.label, color: projection.pressurePresentation.color)
                }

                Text(marker.label)
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let linkedAwaitId = marker.linkedAwaitId {
                    Text("Linked await · \(linkedAwaitId)")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                Text("\(marker.sourceRecordIds.count) source record\(marker.sourceRecordIds.count == 1 ? "" : "s") · tap to inspect the proof")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(projection.pressurePresentation.color.opacity(isReveal ? 0.2 : 0.14))
            .clipShape(.rect(cornerRadius: 22))
        }
        .buttonStyle(.plain)
        .id(marker.id)
        .spotlightHandoff(id: marker.id)
        .replayScrub(direction: scrub, value: marker.id)
        .betrayalFlash(active: isReveal)
    }
}
```

- [ ] **Step 4: Update the `ArenaView` call sites in `ControlRoomScreens.swift`**

`ArenaView` is still in `ControlRoomScreens.swift` (it moves in Task 5). It must render identically. Replace its `ArenaMarquee(…)` call (currently passing `projection/beatNumber/beatCount`) with the parameterized form, building the same four pills via the helper so output is byte-identical:

```swift
                    ArenaMarquee(
                        eyebrow: MarqueePresentation.eyebrow(
                            mode: .operating,
                            condition: projection.home.condition
                        ),
                        headline: projection.pressurePresentation.headline,
                        copy: projection.pressurePresentation.copy,
                        accent: projection.pressurePresentation.color,
                        pills: [
                            MarqueePill(text: projection.pressurePresentation.band, color: projection.pressurePresentation.color),
                            MarqueePill(text: projection.home.currentCursor.label, color: .purple),
                            MarqueePill(text: "Beat \(focusIndex + 1) / \(markers.count)", color: .cyan),
                            MarqueePill(text: "\(projection.home.survivingAgentCount) still in", color: .green),
                        ]
                    )
```

Then change the `SpotlightBeatCard` usage in `ArenaView` from the four trailing modifiers to the folded input. Replace:

```swift
                    SpotlightBeatCard(marker: marker, projection: projection) {
                        model.inspect(.marker(marker))
                    }
                    .id(marker.id)
                    .spotlightHandoff(id: marker.id)
                    .replayScrub(direction: scrubDirection, value: focusIndex)
                    .betrayalFlash(active: BetrayalFlash.isTriggered(byMarkerType: marker.markerType))
```

with:

```swift
                    SpotlightBeatCard(marker: marker, projection: projection, scrub: scrubDirection) {
                        model.inspect(.marker(marker))
                    }
```

Delete the old `private struct ArenaMarquee` and `private struct SpotlightBeatCard` from `ControlRoomScreens.swift` (now in `ArenaGrammar.swift`).

- [ ] **Step 5: Drop decorative `@Bindable` in `ArenaTransportBar`**

In `ArenaGrammar.swift`, change `ArenaTransportBar`'s `@Bindable var model: ControlRoomAppModel` to `let model: ControlRoomAppModel` (it only calls methods / reads values; `@Observable` tracks reads without `@Bindable`). No call-site change needed.

- [ ] **Step 6: Build + test**

Run: `swift build --package-path apps/control-room && swift test --package-path apps/control-room`
Expected: PASS — full suite green.

- [ ] **Step 7: Visual regression check (manual gate)**

Run: `npm --prefix . run gui:demo` is not available in CI; instead verify by inspection that the `ArenaView` body composition order and the marquee pill list are unchanged from AK-63 (same eyebrow text `LIVE · <COND>`, same four pills in order, same `SpotlightBeatCard` placement/`.id`). Confirm in the task review that **Arena renders identically** — this is the gate for this task.

- [ ] **Step 8: Commit**

```bash
git add apps/control-room/Sources/AgentKumiteControlRoom/ArenaGrammar.swift apps/control-room/Sources/AgentKumiteControlRoom/ControlRoomScreens.swift
git commit -m "agent-kumite: extract ArenaGrammar.swift, parameterize marquee, fold spotlight motion (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Split `ArenaView` / `LiveOpsView` / `ReplayLabView` into their own files

Mechanical move so the reframe diffs in Tasks 6-7 stay small and reviewable.

**Files:**
- Create: `apps/control-room/Sources/AgentKumiteControlRoom/ArenaView.swift`
- Create: `apps/control-room/Sources/AgentKumiteControlRoom/LiveOpsView.swift`
- Create: `apps/control-room/Sources/AgentKumiteControlRoom/ReplayLabView.swift`
- Modify: `apps/control-room/Sources/AgentKumiteControlRoom/ControlRoomScreens.swift` (delete the three moved structs)

- [ ] **Step 1: Move the three structs verbatim**

Move `struct ArenaView` → `ArenaView.swift`, `struct LiveOpsView` → `LiveOpsView.swift`, `struct ReplayLabView` → `ReplayLabView.swift`. Each new file gets header `import SwiftUI`. No code changes — pure relocation. `ControlRoomScreens.swift` now holds only `CallsheetView`, `AftermathLedgerView`, `InspectorDetailView`, and the Spectacle-only helpers.

- [ ] **Step 2: Build + test**

Run: `swift build --package-path apps/control-room && swift test --package-path apps/control-room`
Expected: PASS — full suite green, no behavior change.

- [ ] **Step 3: Commit**

```bash
git add apps/control-room/Sources/AgentKumiteControlRoom/
git commit -m "agent-kumite: split Arena/LiveOps/Replay into own files (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Reframe Live Ops on the Arena grammar

`LiveOpsView` becomes "operating the same live match": shared marquee + center-stage shell, the four operator layers as staged Arena rail cards, the awaiting queue as actionable spotlight cards, demoted transport. No `MissionSection`/`LazyVGrid`/table dashboard.

**Files:**
- Modify (full rewrite): `apps/control-room/Sources/AgentKumiteControlRoom/LiveOpsView.swift`

- [ ] **Step 1: Replace `LiveOpsView.swift` with the reframed screen**

```swift
import SwiftUI

/// Live Ops reframed as *operating the same live match*. It reuses the Arena
/// marquee and center-stage shell so the operator is demonstrably looking at
/// the same room, then stages the four operator layers and the awaiting queue
/// as Arena cards — never a dashboard grid or table.
struct LiveOpsView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var railsEntered = false

    private var mode: ArenaMode {
        ArenaModeSelection.mode(
            forKind: projection.kind,
            matchStatus: projection.live?.matchStatus
        )
    }

    private var pills: [MarqueePill] {
        let p = projection.pressurePresentation
        var pills = [
            MarqueePill(text: p.band, color: p.color),
            MarqueePill(text: projection.home.currentCursor.label, color: .purple),
        ]
        if MarqueePresentation.showsSurvivorPill(mode: mode) {
            pills.append(MarqueePill(text: "\(projection.home.survivingAgentCount) still in", color: .green))
        }
        pills.append(MarqueePill(
            text: "\(projection.home.openAwaitCount) awaiting",
            color: projection.home.openAwaitCount > 0 ? .orange : .secondary
        ))
        pills.append(MarqueePill(
            text: projection.home.activeAlertCount > 0 ? "\(projection.home.activeAlertCount) alerts hot" : "alerts quiet",
            color: projection.home.activeAlertCount > 0 ? .red : .green
        ))
        return pills
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ArenaMarquee(
                    eyebrow: MarqueePresentation.eyebrow(mode: mode, condition: projection.home.condition),
                    headline: projection.pressurePresentation.headline,
                    copy: "You are operating this match, not watching a dashboard. Public stage, private whispers, the alert rail and intervention work stay separate but read as one room under pressure.",
                    accent: projection.pressurePresentation.color,
                    pills: pills
                )

                CenterStageShell(
                    projection: projection,
                    band: PressureBand(label: projection.pressurePresentation.band),
                    castEntered: railsEntered
                )

                if let snapshot = projection.latestLayeredSnapshot {
                    OperatorRailStrip(
                        projection: projection,
                        snapshot: snapshot,
                        railsEntered: railsEntered
                    )
                } else {
                    ContentUnavailableView(
                        "No Layered Snapshot",
                        systemImage: "waveform.path.ecg",
                        description: Text("This projection has no live room snapshot yet. The operator rails light up once the first layered snapshot lands.")
                    )
                    .frame(maxWidth: .infinity, minHeight: 160)
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: 18))
                }

                AwaitingQueueDeck(
                    items: projection.live?.awaitingQueue ?? [],
                    accent: projection.pressurePresentation.color,
                    railsEntered: railsEntered
                ) { item in
                    onInspect(.liveAwait(item))
                }

                if projection.replay.markers.isEmpty == false {
                    EventTickerView(
                        markers: projection.replay.markers,
                        focusIndex: projection.replay.markers.count - 1,
                        accentColor: projection.pressurePresentation.color
                    ) { index in
                        onInspect(.marker(projection.replay.markers[index]))
                    }
                }
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(ControlRoomBackdrop())
        .onAppear { railsEntered = true }
    }
}

/// The four operator layers as staged Arena cards. Each card surfaces its live
/// edge as a headline read, then supporting counts — not a table.
private struct OperatorRailStrip: View {
    let projection: LoadedProjection
    let snapshot: LayeredSnapshot
    let railsEntered: Bool

    private var rails: [OperatorRail] {
        [
            OperatorRail(
                title: "Public stage",
                icon: "text.line.first.and.arrowtriangle.forward",
                edge: projection.latestMarker?.label ?? "No beat on stage yet",
                accent: .cyan,
                counts: [
                    ("Events", snapshot.publicStream.eventIds.count),
                    ("Replay pins", snapshot.publicStream.markerIds.count),
                ]
            ),
            OperatorRail(
                title: "Private whispers",
                icon: "eye.slash",
                edge: projection.betrayalCallouts.first ?? "No exposed divergence yet",
                accent: .indigo,
                counts: [
                    ("Artifacts", snapshot.privateState.artifactIds.count),
                    ("Envelopes", snapshot.privateState.commitmentEnvelopeIds.count),
                ]
            ),
            OperatorRail(
                title: "Alert rail",
                icon: snapshot.alerts.activeAlertIds.isEmpty ? "bell" : "bell.badge",
                edge: snapshot.alerts.activeAlertIds.isEmpty ? "Room tone: quiet" : "Room tone: escalated",
                accent: snapshot.alerts.activeAlertIds.isEmpty ? .green : .red,
                counts: [
                    ("Active", snapshot.alerts.activeAlertIds.count),
                    ("Total", snapshot.alerts.alertIds.count),
                ]
            ),
            OperatorRail(
                title: "Intervention rail",
                icon: "person.crop.circle.badge.exclamationmark",
                edge: snapshot.interventionQueue.pendingInterventionIds.isEmpty
                    ? "No human action pending"
                    : "\(snapshot.interventionQueue.pendingInterventionIds.count) awaiting your call",
                accent: snapshot.interventionQueue.pendingInterventionIds.isEmpty ? .green : .orange,
                counts: [
                    ("Pending", snapshot.interventionQueue.pendingInterventionIds.count),
                    ("Open awaits", projection.live?.openAwaitIds.count ?? projection.home.openAwaitCount),
                ]
            ),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("OPERATOR RAILS · ONE ROOM, FOUR LAYERS")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(Array(rails.enumerated()), id: \.element.id) { index, rail in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Image(systemName: rail.icon)
                                    .foregroundStyle(rail.accent)
                                Text(rail.title)
                                    .font(.headline)
                            }
                            Text(rail.edge)
                                .font(.system(.title3, design: .rounded).weight(.semibold))
                                .foregroundStyle(rail.accent)
                                .lineLimit(3)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Spacer(minLength: 0)
                            HStack(spacing: 8) {
                                ForEach(rail.counts, id: \.0) { label, value in
                                    TagPillView(text: "\(label) \(value)", color: rail.accent)
                                }
                            }
                        }
                        .frame(width: 240, height: 190, alignment: .topLeading)
                        .padding(18)
                        .background(rail.accent.opacity(0.14))
                        .clipShape(.rect(cornerRadius: 18))
                        .castEntrance(index: index, entered: railsEntered)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 18))
    }
}

private struct OperatorRail: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let edge: String
    let accent: Color
    let counts: [(String, Int)]
}

/// The awaiting queue as the operator's focal work: staged spotlight-style
/// cards, each tappable into the inspector. Not a list of rows.
private struct AwaitingQueueDeck: View {
    let items: [LiveAwaitingQueueItem]
    let accent: Color
    let railsEntered: Bool
    let onInspect: (LiveAwaitingQueueItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("AWAITING YOUR CALL")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            if items.isEmpty {
                Text("No open awaiting items. The room is observational right now — nothing is waiting on you.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .background(.regularMaterial)
                    .clipShape(.rect(cornerRadius: 16))
            } else {
                VStack(spacing: 12) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        Button {
                            onInspect(item)
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(spacing: 10) {
                                    Image(systemName: "pause.circle.fill")
                                        .font(.title2)
                                        .foregroundStyle(accent)
                                    Text(item.prompt)
                                        .font(.system(.title3, design: .rounded).weight(.bold))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                HStack(spacing: 8) {
                                    TagPillView(text: item.kind.capitalized, color: accent)
                                    TagPillView(text: item.status.capitalized, color: .purple)
                                    TagPillView(text: "by \(item.openedBy)", color: .secondary)
                                }
                            }
                            .padding(22)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(accent.opacity(0.16))
                            .clipShape(.rect(cornerRadius: 20))
                        }
                        .buttonStyle(.plain)
                        .castEntrance(index: index, entered: railsEntered)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 18))
    }
}
```

- [ ] **Step 2: Build + test**

Run: `swift build --package-path apps/control-room && swift test --package-path apps/control-room`
Expected: PASS — full suite green. (No new unit tests: the new derived decisions all route through Task 1/2 helpers, already covered.)

- [ ] **Step 3: Dynamism gate (mandatory review check)**

Confirm in review: Live Ops now shares the marquee + center-stage shell with Arena, the four layers are staged motion cards with a headline "edge" read (not count tables), the awaiting queue is spotlight cards with staged entrance. If any part reads as a static grid/table, it fails the standing gate — revise before commit.

- [ ] **Step 4: Commit**

```bash
git add apps/control-room/Sources/AgentKumiteControlRoom/LiveOpsView.swift
git commit -m "agent-kumite: reframe Live Ops on Arena grammar (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Reframe Replay on the Arena grammar

`ReplayLabView` becomes recap + scrub + proof: recap marquee, selected marker driving a `SpotlightBeatCard` with scrub motion, the `EventTickerView` as the scrubber, the canonical snapshot promoted to a spotlight proof card with the rest as a horizontal Arena ladder. No bordered `Table`.

**Files:**
- Modify (full rewrite): `apps/control-room/Sources/AgentKumiteControlRoom/ReplayLabView.swift`

- [ ] **Step 1: Replace `ReplayLabView.swift` with the reframed screen**

```swift
import SwiftUI

/// Replay reframed as recap, scrub, and proof in the Arena language. The
/// ticker IS the scrubber; the selected marker is dramatized as a spotlight;
/// the canonical snapshot is a spotlight proof card, the rest a horizontal
/// ladder — never a bordered table.
struct ReplayLabView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var focusIndex = 0
    @State private var snapshotSelection: Int?
    @State private var scrubDirection: ScrubDirection = .none
    @State private var reelEntered = false

    private var markers: [ReplayMarker] { projection.replay.markers }
    private var snapshots: [ReplaySnapshot] { projection.replay.snapshots }

    private var spotlightSnapshot: ReplaySnapshot? {
        SpotlightSnapshotSelection
            .index(count: snapshots.count, selected: snapshotSelection)
            .map { snapshots[$0] }
    }

    private var pills: [MarqueePill] {
        let p = projection.pressurePresentation
        return [
            MarqueePill(text: p.band, color: p.color),
            MarqueePill(text: "\(projection.replay.markerCount) recap beats", color: .pink),
            MarqueePill(text: "\(projection.replay.snapshotCount) proof snapshots", color: .teal),
        ]
    }

    var body: some View {
        if markers.isEmpty, snapshots.isEmpty {
            ContentUnavailableView(
                "Nothing To Recap",
                systemImage: "film.stack",
                description: Text("This projection has no replay markers or snapshots yet. The recap reel fills in once the match produces beats.")
            )
            .background(ControlRoomBackdrop())
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    ArenaMarquee(
                        eyebrow: MarqueePresentation.eyebrow(mode: .recap, condition: projection.home.condition),
                        headline: "The recap reel",
                        copy: "Scrub the memorable beats, then prove them. Betrayals, reveals, eliminations and match-point turns stay inspectable without flattening the room into telemetry.",
                        accent: projection.pressurePresentation.color,
                        pills: pills
                    )

                    if markers.isEmpty == false {
                        let marker = markers[min(focusIndex, markers.count - 1)]
                        SpotlightBeatCard(marker: marker, projection: projection, scrub: scrubDirection) {
                            onInspect(.marker(marker))
                        }

                        EventTickerView(
                            markers: markers,
                            focusIndex: min(focusIndex, markers.count - 1),
                            accentColor: projection.pressurePresentation.color
                        ) { index in
                            scrubDirection = ScrubDirection.between(previousIndex: focusIndex, currentIndex: index)
                            focusIndex = index
                            onInspect(.marker(markers[index]))
                        }
                    }

                    if projection.betrayalCallouts.isEmpty == false {
                        RecapCalloutStrip(
                            callouts: projection.betrayalCallouts,
                            accent: projection.pressurePresentation.color,
                            reelEntered: reelEntered
                        )
                    }

                    if let proof = spotlightSnapshot {
                        SnapshotProofCard(snapshot: proof, accent: .teal) {
                            onInspect(.snapshot(proof))
                        }

                        if snapshots.count > 1 {
                            SnapshotLadderStrip(
                                snapshots: snapshots,
                                selectedId: proof.id,
                                reelEntered: reelEntered
                            ) { tapped in
                                if let idx = snapshots.firstIndex(where: { $0.id == tapped.id }) {
                                    snapshotSelection = idx
                                    onInspect(.snapshot(tapped))
                                }
                            }
                        }
                    }
                }
                .padding(28)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(ControlRoomBackdrop())
            .onAppear { reelEntered = true }
        }
    }
}

private struct RecapCalloutStrip: View {
    let callouts: [String]
    let accent: Color
    let reelEntered: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RECAP REEL · WHAT THE ROOM WILL REMEMBER")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(callouts.enumerated()), id: \.offset) { index, callout in
                        HStack(spacing: 10) {
                            Image(systemName: "film.stack")
                                .foregroundStyle(accent)
                            Text(callout)
                                .font(.callout.weight(.semibold))
                                .lineLimit(3)
                        }
                        .frame(width: 240, alignment: .leading)
                        .padding(16)
                        .background(accent.opacity(0.14))
                        .clipShape(.rect(cornerRadius: 14))
                        .castEntrance(index: index, entered: reelEntered)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 18))
    }
}

/// The canonical snapshot promoted into a spotlight proof card — the Replay
/// analogue of `SpotlightBeatCard`, not a table row.
private struct SnapshotProofCard: View {
    let snapshot: ReplaySnapshot
    let accent: Color
    let onInspect: () -> Void

    var body: some View {
        Button(action: onInspect) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title2)
                        .foregroundStyle(accent)
                    Text("Proof · \(snapshot.cursor.label)")
                        .font(.headline)
                    Spacer()
                    TagPillView(text: snapshot.capturedAt, color: accent)
                }
                Text("Reconstructable state at this cursor")
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 10) {
                    TagPillView(text: "\(snapshot.aliveAgentIds.count) alive", color: .green)
                    TagPillView(text: "\(snapshot.eliminatedAgentIds.count) out", color: .red)
                    TagPillView(text: "\(snapshot.openAwaitIds.count) awaiting", color: .orange)
                }
                Text("Tap to inspect the full reconstruction.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(accent.opacity(0.14))
            .clipShape(.rect(cornerRadius: 22))
        }
        .buttonStyle(.plain)
        .id(snapshot.id)
        .spotlightHandoff(id: snapshot.id)
    }
}

private struct SnapshotLadderStrip: View {
    let snapshots: [ReplaySnapshot]
    let selectedId: String
    let reelEntered: Bool
    let onSelect: (ReplaySnapshot) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PROOF LADDER · SCRUB THE RECONSTRUCTION")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(snapshots.enumerated()), id: \.element.id) { index, snapshot in
                        let isSelected = snapshot.id == selectedId
                        Button {
                            onSelect(snapshot)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(snapshot.cursor.label)
                                    .font(.headline)
                                Text("\(snapshot.aliveAgentIds.count) alive · \(snapshot.openAwaitIds.count) awaiting")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(snapshot.capturedAt)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                            .frame(width: 200, alignment: .leading)
                            .padding(14)
                            .background(Color.teal.opacity(isSelected ? 0.28 : 0.12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(.teal, lineWidth: isSelected ? 2 : 0)
                            )
                            .clipShape(.rect(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                        .castEntrance(index: index, entered: reelEntered)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 18))
    }
}
```

- [ ] **Step 2: Build + test**

Run: `swift build --package-path apps/control-room && swift test --package-path apps/control-room`
Expected: PASS — full suite green.

- [ ] **Step 3: Dynamism gate (mandatory review check)**

Confirm in review: Replay shares the marquee + spotlight + ticker grammar with Arena; the ticker scrubs the spotlight with directional motion; the snapshot proof is a spotlight card + horizontal ladder, **no `Table`**. If it reads static, it fails the standing gate — revise before commit.

- [ ] **Step 4: Commit**

```bash
git add apps/control-room/Sources/AgentKumiteControlRoom/ReplayLabView.swift
git commit -m "agent-kumite: reframe Replay on Arena grammar (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Final verification, version bump, resolve

**Files:**
- Modify: `apps/control-room/` (verification only)
- Modify: `package.json` (version bump)

- [ ] **Step 1: Full build + test**

Run: `swift build --package-path apps/control-room && swift test --package-path apps/control-room`
Expected: PASS — entire suite green.

- [ ] **Step 2: Confirm scope guards held**

Verify by `git diff fb688a6 -- apps/control-room/Sources/AgentKumiteControlRoom/`:
- No diff to `ControlRoomAppModel.swift`, `ProjectionModels.swift` (`PresentationState`), `ControlRoomRootView.swift` logic.
- `CallsheetView` / `AftermathLedgerView` / `InspectorDetailView` bodies unchanged (only relocated if at all).
- No new motion primitives in `MotionSystem.swift` (only pure decision enums + the existing primitives).
Expected: confirmed; flag any violation before resolving.

- [ ] **Step 3: Bump version (minor — new user-facing surface behavior)**

In `package.json`, change `"version": "0.1.0"` to `"version": "0.2.0"`.

```bash
git add package.json
git commit -m "agent-kumite: bump version to 0.2.0 for Arena-grammar Live Ops/Replay (AK-64)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand back to the op workflow**

Report completion to the parent op:issue flow: all commits, the version, and the dynamism-gate confirmation. The op:resolve verb handles `commits:` back-fill, `version:` property, the `## Summary` section, the move to `RESOLVED ISSUES/`, and the GitHub issue close — do **not** do those here.

---

## Self-Review

**Spec coverage:**
- Decomposition order (ProjectionPresentation → helpers → ArenaGrammar → split → reframe) → Tasks 3, 1-2, 4, 5, 6-7. ✓
- All seven named helpers → Tasks 1 (`PressureBandSelection`, `TensionGauge`) and 2 (`ArenaMode`, `MarqueePresentation`, `ArenaModeSelection`, `SpotlightSnapshotSelection`). ✓ (`pressurePresentation` band test → Task 1 `PressureBandSelectionTests`.)
- Marquee parameterized on data, no mode-branching in the view → Task 4 Step 2. ✓
- `SpotlightBeatCard` motion contract folded in → Task 4 Step 3. ✓
- Drop decorative `@Bindable` → Task 4 Step 5. ✓
- Live Ops reframe (marquee + shell + four staged rails + spotlight awaiting deck) → Task 6. ✓
- Replay reframe (recap marquee, spotlight beat, ticker-as-scrubber, snapshot proof card + ladder, no Table) → Task 7. ✓
- Scope guards (no model/PresentationState change, no new motion primitives, Spectacle screens untouched) → Task 8 Step 2. ✓
- Version bump + resolve handback → Task 8. ✓
- Standing dynamism gate → explicit review step in Tasks 6 and 7, plus header. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; mechanical moves name exact symbols and access-control changes. ✓

**Type consistency:** `ArenaMode` cases `operating/live/recap` used consistently across Tasks 2/4/6/7. `MarqueePill(text:color:)` defined Task 4, used Tasks 4/6/7. `SpotlightBeatCard(marker:projection:scrub:onInspect:)` signature defined Task 4, used Tasks 4/7. `MarqueePresentation.eyebrow/showsBeatCounter/showsSurvivorPill` and `ArenaModeSelection.mode(forKind:matchStatus:)` signatures consistent Tasks 2/6/7. `SpotlightSnapshotSelection.index(count:selected:)` defined Task 2, used Task 7. ✓
