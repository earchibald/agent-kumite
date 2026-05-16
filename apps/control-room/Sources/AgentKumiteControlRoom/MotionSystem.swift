import SwiftUI

/// State-driven motion system for the control room.
///
/// Every primitive here animates off a value derived from the **canonical
/// projection / `PresentationState`** — never a decorative free-running timer
/// and never `Double.random`. Animations fire through `.animation(_, value:)`
/// on a state-derived value or a `transition` on an identity change. The one
/// repeating element (`eventPulse`) is gated on canonical state
/// (`activeAlertCount > 0`) and its strength is derived from the pressure band:
/// a state-conditioned heartbeat, not ambient decoration. A quiet room with no
/// active alerts produces no pulse at all.
///
/// `GameMotion` is the single source of timing truth so every surface shares
/// one animation vocabulary and the product feels like one game.

// MARK: - Shared vocabulary

enum GameMotion {
    /// Spotlight handoff between focal beats / selected cast.
    static let spotlightHandoff: TimeInterval = 0.45
    /// Pressure-shell rings contracting as the band tightens.
    static let shellContraction: TimeInterval = 0.7
    /// One beat of the alert heartbeat.
    static let eventPulse: TimeInterval = 1.1
    /// A single betrayal accent flash.
    static let betrayalFlash: TimeInterval = 0.35
    /// Replay scrub slide between beats / ladder rows.
    static let replayScrub: TimeInterval = 0.4
    /// Per-index delay added to each aftermath story beat reveal.
    static let aftermathStaggerStep: TimeInterval = 0.12
    /// Upper bound on the staggered reveal so long timelines stay snappy.
    static let aftermathStaggerCap: TimeInterval = 0.96
    /// Per-index delay added to each cast member's staged entrance.
    static let castEntranceStep: TimeInterval = 0.09
    /// Upper bound on the cast lineup so a full roster still enters briskly.
    static let castEntranceCap: TimeInterval = 0.72

    static var spotlightHandoffAnimation: Animation {
        .spring(response: spotlightHandoff, dampingFraction: 0.82)
    }

    static var shellContractionAnimation: Animation {
        .easeInOut(duration: shellContraction)
    }

    static var betrayalFlashAnimation: Animation {
        .easeOut(duration: betrayalFlash)
    }

    static var replayScrubAnimation: Animation {
        .spring(response: replayScrub, dampingFraction: 0.78)
    }

    /// Pulse repeats only while the modifier stays mounted, which callers gate
    /// on canonical state — it is not a standalone clock.
    static var eventPulseAnimation: Animation {
        .easeInOut(duration: eventPulse).repeatForever(autoreverses: true)
    }

    static func aftermathStaggerAnimation(forIndex index: Int) -> Animation {
        .easeOut(duration: spotlightHandoff).delay(AftermathSequence.delay(forIndex: index))
    }

    /// Entrance for the cast member at `index`, staged so the lineup walks on
    /// one after another instead of popping in together.
    static func castEntranceAnimation(forIndex index: Int) -> Animation {
        .spring(response: spotlightHandoff, dampingFraction: 0.78)
            .delay(CastEntrance.delay(forIndex: index))
    }
}

// MARK: - Canonical pressure band

/// Typed view of the projection's pressure band label so motion intensity is
/// derived from canonical match state rather than ad-hoc string checks.
enum PressureBand: String, CaseIterable {
    case open = "Open"
    case tightening = "Tightening"
    case pressurized = "Pressurized"
    case knifeEdge = "Knife-edge"

    init(label: String) {
        self = PressureBand(rawValue: label) ?? .open
    }
}

// MARK: - Pure motion parameters (unit-tested)

enum ShellContraction {
    /// 0 = open shell at full radius, 1 = fully collapsed. Monotonic in band.
    static func intensity(forBand band: PressureBand) -> Double {
        switch band {
        case .open: 0.0
        case .tightening: 0.4
        case .pressurized: 0.7
        case .knifeEdge: 1.0
        }
    }
}

enum AftermathSequence {
    /// Reveal delay for the story beat at `index`, clamped to the cap so a long
    /// timeline does not crawl in.
    static func delay(forIndex index: Int) -> TimeInterval {
        let raw = Double(max(0, index)) * GameMotion.aftermathStaggerStep
        return min(raw, GameMotion.aftermathStaggerCap)
    }
}

enum CastEntrance {
    /// Entrance delay for the cast member at `index`, clamped to the cap so a
    /// full roster still finishes walking on quickly. Negative indices snap to 0.
    static func delay(forIndex index: Int) -> TimeInterval {
        let raw = Double(max(0, index)) * GameMotion.castEntranceStep
        return min(raw, GameMotion.castEntranceCap)
    }
}

enum EventTickerWindow {
    /// The contiguous marker indices the live ticker should show: a fixed-size
    /// window of `2 * radius + 1` that *slides* with the focal index instead of
    /// shrinking at the timeline edges. Derived purely from canonical
    /// `PresentationState` focus — never a timer. Returns `[]` for an empty
    /// timeline; shows everything when the timeline is shorter than the window.
    static func indices(count: Int, focus: Int, radius: Int) -> [Int] {
        guard count > 0 else { return [] }

        let span = max(1, 2 * radius + 1)
        guard count > span else { return Array(0..<count) }

        let clampedFocus = min(max(focus, 0), count - 1)
        let start = min(max(clampedFocus - radius, 0), count - span)
        return Array(start..<(start + span))
    }
}

enum ScrubDirection {
    case forward
    case backward
    case none

    /// Direction of a replay scrub, taken from the sign of the focus-index
    /// delta — canonical `PresentationState` movement, not a guess.
    static func between(previousIndex: Int, currentIndex: Int) -> ScrubDirection {
        if currentIndex > previousIndex {
            .forward
        } else if currentIndex < previousIndex {
            .backward
        } else {
            .none
        }
    }
}

enum BetrayalFlash {
    private static let triggerStems = ["betray", "diverg", "reveal", "elimination", "deadlock"]

    /// True only for betrayal-class replay marker types. The flash fires when a
    /// betrayal beat takes focus — derived from the marker, not a timer.
    static func isTriggered(byMarkerType markerType: String) -> Bool {
        let lowered = markerType.lowercased()
        return triggerStems.contains { lowered.contains($0) }
    }
}

enum EventPulse {
    /// The pulse exists only when canonical state reports a live alert.
    static func isActive(activeAlertCount: Int) -> Bool {
        activeAlertCount > 0
    }

    /// Pulse amplitude scales with how tight the room is.
    static func strength(forBand band: PressureBand) -> Double {
        switch band {
        case .open: 0.25
        case .tightening: 0.5
        case .pressurized: 0.75
        case .knifeEdge: 1.0
        }
    }
}

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

// MARK: - SwiftUI primitives

extension View {
    /// Animate this view as a spotlight when `id` (a canonical identity such as
    /// the focused marker id or selected cast id) changes.
    func spotlightHandoff<ID: Equatable>(id: ID) -> some View {
        animation(GameMotion.spotlightHandoffAnimation, value: id)
            .transition(.asymmetric(
                insertion: .opacity.combined(with: .scale(scale: 0.97)),
                removal: .opacity
            ))
    }

    /// Slide + fade as a replay scrub. Direction is the sign of the focus-index
    /// delta, so forward and backward scrubs read differently.
    func replayScrub(direction: ScrubDirection, value: some Equatable) -> some View {
        let edge: Edge = direction == .backward ? .leading : .trailing
        return transition(.asymmetric(
            insertion: .move(edge: edge).combined(with: .opacity),
            removal: .opacity
        ))
        .animation(GameMotion.replayScrubAnimation, value: value)
    }

    /// One-shot accent flash when a betrayal-class beat takes focus.
    func betrayalFlash(active: Bool) -> some View {
        modifier(BetrayalFlashModifier(active: active))
    }

    /// State-gated alert heartbeat. With `active == false` the view is
    /// completely still — no pulse for a quiet room.
    func eventPulse(active: Bool, strength: Double) -> some View {
        modifier(EventPulseModifier(active: active, strength: strength))
    }

    /// Reveal as part of a staggered aftermath sequence, ordered by `index`.
    /// `appeared` is a one-shot flag flipped on view appear — not a loop.
    func aftermathSequenced(index: Int, appeared: Bool) -> some View {
        opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 14)
            .animation(GameMotion.aftermathStaggerAnimation(forIndex: index), value: appeared)
    }

    /// Stage a cast member walking onto the Arena, ordered by `index`. `entered`
    /// is a one-shot flag flipped on scene appear — a deliberate lineup, not a
    /// loop and not a timer.
    func castEntrance(index: Int, entered: Bool) -> some View {
        opacity(entered ? 1 : 0)
            .scaleEffect(entered ? 1 : 0.92)
            .offset(y: entered ? 0 : 18)
            .animation(GameMotion.castEntranceAnimation(forIndex: index), value: entered)
    }
}

private struct BetrayalFlashModifier: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        content
            .overlay {
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.red, lineWidth: active ? 3 : 0)
                    .opacity(active ? 0.85 : 0)
            }
            .animation(GameMotion.betrayalFlashAnimation, value: active)
    }
}

private struct EventPulseModifier: ViewModifier {
    let active: Bool
    let strength: Double

    @State private var pulsed = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(active && pulsed ? 1 + 0.04 * strength : 1)
            .opacity(active && pulsed ? 1 : (active ? 0.85 : 1))
            .animation(active ? GameMotion.eventPulseAnimation : .default, value: pulsed)
            .onChange(of: active, initial: true) { _, isActive in
                pulsed = isActive
            }
    }
}
