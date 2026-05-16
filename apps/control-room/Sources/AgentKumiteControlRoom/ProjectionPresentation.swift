import Foundation
import SwiftUI

// MARK: - Pressure presentation

struct PressurePresentation {
    let band: String
    let headline: String
    let copy: String
    let color: Color
}

// MARK: - LoadedProjection presentation derivation

extension LoadedProjection {
    var featuredCast: [CallsheetRow] {
        Array(callsheet.sorted {
            if $0.scoreTotal != $1.scoreTotal {
                return $0.scoreTotal > $1.scoreTotal
            }

            if $0.latestRoundDelta != $1.latestRoundDelta {
                return $0.latestRoundDelta > $1.latestRoundDelta
            }

            return $0.seat < $1.seat
        }.prefix(min(4, callsheet.count)))
    }

    var betrayalCallouts: [String] {
        let sourceLabels = (benchmarkSummary?.highlightLabels ?? [])
            + (aftermath?.replayMarkerSummary.labels ?? [])
            + replay.markers.map(\.label)

        let filtered = sourceLabels.filter { label in
            let lowered = label.lowercased()
            return lowered.contains("betray")
                || lowered.contains("diverg")
                || lowered.contains("reveal")
                || lowered.contains("elimination")
                || lowered.contains("deadlock")
                || lowered.contains("resolved:")
        }

        return filtered.uniqued().prefix(6).map(\.self)
    }

    var heroCopy: String {
        let markerText = latestMarker?.label ?? "No replay marker pinned yet."
        return "Benchmark-first underneath, show-first on the surface. \(home.currentCursor.label) is the current beat, \(pressurePresentation.band.lowercased()) pressure is live, and the latest proof marker is: \(markerText)"
    }

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

    var tensionPercent: Int {
        TensionGauge.percent(
            forBand: PressureBandSelection.band(
                survivingAgentCount: home.survivingAgentCount,
                round: home.currentCursor.round
            )
        )
    }

    var hotSignals: [String] {
        if betrayalCallouts.isEmpty == false {
            return Array(betrayalCallouts.prefix(3))
        }

        return [
            latestMarker?.label ?? "No marker armed yet",
            "\(home.survivingAgentCount) cast members still live",
            "\(home.openAwaitCount) awaiting items in the queue",
        ]
    }

    var finalForecast: String {
        featuredCast.first.map { "\($0.displayName) currently fronts the room" } ?? "No forecast"
    }

    var seasonNotes: [String] {
        var notes: [String] = []
        if let top = callsheet.max(by: { $0.scoreTotal < $1.scoreTotal }) {
            notes.append("\(top.displayName) leads tonight's scorecard")
        }
        if let suspicious = callsheet.max(by: { $0.pressureScore < $1.pressureScore }) {
            notes.append("\(suspicious.displayName) is carrying the hottest pressure read")
        }
        return notes.prefix(3).map(\.self)
    }

    var pressureForecast: String {
        "Round \(max(home.currentCursor.round, 3)) forces public nomination pressure. DM space keeps shrinking, and the next reveal beat should land hard."
    }

    var modelMixLines: [String] {
        let counts = Dictionary(grouping: callsheet, by: { $0.modelBadge.split(separator: ":").first.map(String.init) ?? $0.modelBadge })
            .mapValues(\.count)
        return counts.keys.sorted().map { "\($0): \(counts[$0] ?? 0)" }
    }

    var allianceHints: [String] {
        if featuredCast.count >= 2 {
            return [
                "\(featuredCast[0].displayName) + \(featuredCast[1].displayName) read as a live axis",
                betrayalCallouts.first ?? "\(featuredCast[0].displayName) is the room's current center of gravity",
            ]
        }

        return betrayalCallouts.prefix(2).map(\.self)
    }

    var aftermathHeadline: String {
        if let winner = aftermath?.winners.first?.agentId {
            return "\(winner) survived the shell and closed the episode"
        }
        return "The room closed without a clean victor"
    }

    var storyTimeline: [(title: String, subtitle: String)] {
        var beats: [(String, String)] = []
        if let first = betrayalCallouts.first {
            beats.append(("Hidden turn exposed", first))
        }
        if let elimination = aftermath?.eliminations.first {
            beats.append(("Elimination beat", "Round \(elimination.round) removed \(elimination.agentId)"))
        }
        if let winner = aftermath?.winners.first {
            beats.append(("Endgame locked", "\(winner.agentId) finished with \(winner.total) points"))
        }
        return beats.isEmpty ? [("No recap beat", "The current artifact bundle does not surface a narrative sequence yet.")] : beats
    }

    var storyboardFrames: [(title: String, subtitle: String)] {
        [
            ("Frame A — Cast intro snapshot", featuredCast.first.map { "\($0.displayName) entered as \(String($0.roleLabel.lowercased()))" } ?? "Cast not available"),
            ("Frame B — Betrayal reveal", betrayalCallouts.first ?? "No betrayal reveal surfaced"),
            ("Frame C — Pressure shell collapse", pressurePresentation.copy),
            ("Frame D — Victory card", aftermath?.winners.first.map { "\($0.agentId) closes with \($0.total) points" } ?? "No winner card"),
        ]
    }

    func confessionalQuote(for agentId: String) -> String {
        if let quote = betrayalCallouts.first(where: { $0.localizedCaseInsensitiveContains(agentId.replacingOccurrences(of: "agent-", with: "")) }) {
            return quote
        }
        return "I needed the room calm until the last turn."
    }

    var modelCompareLines: [String] {
        featuredCast.map { "\($0.modelBadge): \($0.suspicionLabel.lowercased()) / \($0.commitmentCount) commitments" }
    }
}

// MARK: - CallsheetRow presentation derivation

extension CallsheetRow {
    var roleLabel: String {
        role.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var statusLabel: String {
        status.capitalized
    }

    var roleMotif: String {
        switch role.lowercased() {
        case "saboteur":
            "Chaos engine"
        case "analyst":
            "God-view"
        default:
            "Contender seat"
        }
    }

    var suspicionLabel: String {
        if privateArtifactCount > 0 || commitmentCount > 0 {
            return "Under suspicion"
        }

        if alertCount > 0 {
            return "Needs eyes"
        }

        if latestRoundDelta > 0 {
            return "Gaining heat"
        }

        return "Steady"
    }

    var suspicionColor: Color {
        switch suspicionLabel {
        case "Under suspicion":
            .red
        case "Needs eyes":
            .orange
        case "Gaining heat":
            .yellow
        default:
            .green
        }
    }

    var statusColor: Color {
        status == "eliminated" ? .red : .green
    }

    var pressureScore: Int {
        min(99, 35 + scoreTotal * 4 + commitmentCount * 10 + privateArtifactCount * 12 + alertCount * 15 + (status == "eliminated" ? 20 : 0))
    }

    var ladderCopy: String {
        if status == "eliminated" {
            return "eliminated • score \(scoreTotal)"
        }
        if suspicionLabel == "Under suspicion" {
            return "betrayal marker active"
        }
        return "\(suspicionLabel.lowercased()) • score \(scoreTotal)"
    }

    var tagline: String {
        switch role.lowercased() {
        case "saboteur":
            return "breaks alliances late"
        case "analyst":
            return "sees more than says"
        default:
            return latestRoundDelta > 0 ? "trusted until cornered" : "still writing tonight's angle"
        }
    }

    var publicHook: String {
        switch role.lowercased() {
        case "saboteur":
            return "smiles first, cuts later"
        case "analyst":
            return "sees the turn before the table does"
        default:
            return latestRoundDelta > 0 ? "wins rooms before the vote starts" : "looks steady until the shell closes"
        }
    }

    func rivalLabel(in rows: [CallsheetRow]) -> String {
        rows.first(where: { $0.id != id && $0.role != role })?.displayName ?? "field"
    }

    func knownTension(in rows: [CallsheetRow]) -> String {
        let rival = rivalLabel(in: rows)
        return "trusts the room until \(rival) forces the angle"
    }
}

// MARK: - Callsheet ordering

extension Array where Element == CallsheetRow {
    var sortedByPressure: [CallsheetRow] {
        sorted {
            if $0.pressureScore != $1.pressureScore {
                return $0.pressureScore > $1.pressureScore
            }
            return $0.seat < $1.seat
        }
    }
}

// MARK: - String helpers

extension Array where Element == String {
    func uniqued() -> [String] {
        var seen = Set<String>()
        return filter { seen.insert($0).inserted }
    }
}
