import Foundation

enum ProjectionKind: String, Equatable {
    case control
    case live

    var displayTitle: String {
        switch self {
        case .control:
            "Benchmark projection"
        case .live:
            "Live projection"
        }
    }
}

enum ControlRoomScreen: String, CaseIterable, Identifiable, Hashable {
    case home
    case callsheet
    case liveOps
    case replayLab
    case aftermathLedger

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home:
            "Home"
        case .callsheet:
            "Callsheet"
        case .liveOps:
            "Live Ops"
        case .replayLab:
            "Replay Lab"
        case .aftermathLedger:
            "Aftermath"
        }
    }

    var systemImage: String {
        switch self {
        case .home:
            "rectangle.3.group"
        case .callsheet:
            "person.3.sequence"
        case .liveOps:
            "waveform.path.ecg.rectangle"
        case .replayLab:
            "gobackward"
        case .aftermathLedger:
            "list.bullet.rectangle"
        }
    }
}

/// App-side presentation layer over the immutable projection JSON.
///
/// The projection contract stays the source of truth; this struct only tracks
/// *how* the Arena presents it — a clock/focus into the ordered beat list plus
/// staged playback. It owns no projection data and never mutates the JSON.
struct PresentationState {
    private(set) var focusIndex: Int
    private(set) var isPlaying: Bool
    private var beatCount: Int

    init(beatCount: Int) {
        self.beatCount = max(0, beatCount)
        focusIndex = 0
        isPlaying = false
    }

    var hasFocus: Bool {
        beatCount > 0
    }

    var isAtEnd: Bool {
        hasFocus && focusIndex == beatCount - 1
    }

    mutating func play() {
        guard hasFocus else { return }
        isPlaying = true
    }

    mutating func pause() {
        isPlaying = false
    }

    mutating func stepForward() {
        guard hasFocus else { return }

        if focusIndex < beatCount - 1 {
            focusIndex += 1
        } else {
            isPlaying = false
        }
    }

    mutating func stepBackward() {
        guard hasFocus else { return }
        focusIndex = max(0, focusIndex - 1)
    }

    mutating func jump(to index: Int) {
        guard hasFocus else {
            focusIndex = 0
            return
        }
        focusIndex = min(max(0, index), beatCount - 1)
    }

    mutating func reset() {
        focusIndex = 0
        isPlaying = false
    }

    mutating func rebind(beatCount newCount: Int) {
        beatCount = max(0, newCount)
        isPlaying = false
        focusIndex = hasFocus ? min(focusIndex, beatCount - 1) : 0
    }
}

enum ProjectionLoadError: LocalizedError {
    case unsupportedFormat

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat:
            "The selected JSON file is not a control-room or live-control-room projection."
        }
    }
}

struct LoadedProjection {
    let kind: ProjectionKind
    let manifest: ProjectionManifest
    let benchmarkSummary: BenchmarkSummary?
    let home: HomeSummary
    let callsheet: [CallsheetRow]
    let layeredSnapshots: [LayeredSnapshot]
    let replay: ReplayProjection
    let aftermath: AftermathReport?
    let live: LiveProjectionSummary?

    var latestLayeredSnapshot: LayeredSnapshot? {
        layeredSnapshots.last
    }

    var latestMarker: ReplayMarker? {
        replay.markers.last
    }

    static func load(from data: Data) throws -> LoadedProjection {
        let decoder = JSONDecoder()

        if let control = try? decoder.decode(ControlProjectionDocument.self, from: data) {
            return LoadedProjection(
                kind: .control,
                manifest: control.manifest,
                benchmarkSummary: control.benchmarkSummary,
                home: control.home,
                callsheet: control.callsheet,
                layeredSnapshots: control.layeredSnapshots,
                replay: control.replay,
                aftermath: control.aftermath,
                live: nil
            )
        }

        if let live = try? decoder.decode(LiveProjectionDocument.self, from: data) {
            return LoadedProjection(
                kind: .live,
                manifest: live.manifest,
                benchmarkSummary: nil,
                home: live.home,
                callsheet: live.callsheet,
                layeredSnapshots: live.layeredSnapshots,
                replay: live.replay,
                aftermath: nil,
                live: live.live
            )
        }

        throw ProjectionLoadError.unsupportedFormat
    }
}

enum InspectorItem: Identifiable {
    case agent(CallsheetRow)
    case marker(ReplayMarker)
    case snapshot(ReplaySnapshot)
    case standing(AftermathStanding)
    case liveAwait(LiveAwaitingQueueItem)

    var id: String {
        switch self {
        case .agent(let row):
            "agent:\(row.id)"
        case .marker(let marker):
            "marker:\(marker.id)"
        case .snapshot(let snapshot):
            "snapshot:\(snapshot.id)"
        case .standing(let standing):
            "standing:\(standing.id)"
        case .liveAwait(let item):
            "await:\(item.id)"
        }
    }
}

struct ProjectionManifest: Codable {
    let runId: String
    let matchId: String
    let condition: String
    let runSeed: Int?
    let rosterMode: String?
    let memoryMode: String?
    let operatorAffordanceSet: String?
    let validityStatus: String
}

struct BenchmarkSummary: Codable {
    struct Totals: Codable {
        let publicEvents: Int
        let privateArtifacts: Int
        let structuredCommitments: Int
        let speechCommitmentLinks: Int
        let commitmentDivergences: Int
        let replayMarkers: Int
        let alerts: Int
        let interventions: Int
    }

    let roundsPlayed: Int
    let winnerIds: [String]
    let eliminatedAgentIds: [String]
    let totals: Totals
    let highlightLabels: [String]
}

struct HomeSummary: Codable {
    let runId: String
    let matchId: String
    let condition: String
    let currentCursor: PhaseCursor
    let survivingAgentCount: Int
    let eliminatedAgentCount: Int
    let activeAlertCount: Int
    let openAwaitCount: Int
    let latestMarkerId: String?
    let latestMarkerLabel: String?
}

struct CallsheetRow: Codable, Identifiable {
    let agentId: String
    let displayName: String
    let seat: Int
    let role: String
    let modelBadge: String
    let memoryEnabled: Bool
    let status: String
    let scoreTotal: Int
    let latestRoundDelta: Int
    let commitmentCount: Int
    let privateArtifactCount: Int
    let alertCount: Int

    var id: String { agentId }
}

struct PhaseCursor: Codable {
    let round: Int
    let phase: String

    var label: String {
        "Round \(round) · \(phase.replacingOccurrences(of: "_", with: " ").capitalized)"
    }
}

struct LayeredSnapshot: Codable, Identifiable {
    struct PublicStream: Codable {
        let eventIds: [String]
        let markerIds: [String]
    }

    struct PrivateState: Codable {
        let artifactIds: [String]
        let commitmentEnvelopeIds: [String]
    }

    struct Alerts: Codable {
        let alertIds: [String]
        let activeAlertIds: [String]
    }

    struct InterventionQueue: Codable {
        let interventionIds: [String]
        let pendingInterventionIds: [String]
        let disabledPhaseOnePlaceholders: [String]
    }

    let cursor: PhaseCursor
    let publicStream: PublicStream
    let privateState: PrivateState
    let alerts: Alerts
    let interventionQueue: InterventionQueue

    var id: String {
        "\(cursor.round)-\(cursor.phase)"
    }
}

struct ReplayProjection: Codable {
    let timeline: [PhaseCursor]
    let snapshots: [ReplaySnapshot]
    let markers: [ReplayMarker]
    let snapshotCount: Int
    let markerCount: Int
}

struct ReplaySnapshot: Codable, Identifiable {
    let snapshotId: String
    let cursor: PhaseCursor
    let capturedAt: String
    let aliveAgentIds: [String]
    let eliminatedAgentIds: [String]
    let openAwaitIds: [String]
    let scoreByAgent: [String: Int]

    var id: String { snapshotId }
}

struct ReplayMarker: Codable, Identifiable {
    let markerId: String
    let cursor: PhaseCursor
    let markerType: String
    let label: String
    let sourceRecordIds: [String]
    let linkedAwaitId: String?

    var id: String { markerId }
}

struct LiveProjectionSummary: Codable {
    let matchStatus: String
    let openAwaitIds: [String]
    let awaitingQueue: [LiveAwaitingQueueItem]
    let publicEventCount: Int
    let interventionCount: Int
}

struct LiveAwaitingQueueItem: Codable, Identifiable {
    let awaitId: String
    let kind: String
    let prompt: String
    let status: String
    let openedAt: String
    let openedBy: String
    let choiceIds: [String]
    let latestInterventionId: String?

    var id: String { awaitId }
}

struct AftermathReport: Codable {
    let winners: [AftermathStanding]
    let standings: [AftermathStanding]
    let eliminations: [EliminationBeat]
    let interventionSummary: CountSummary
    let divergenceSummary: DivergenceSummary
    let replayMarkerSummary: ReplayMarkerSummary
    let roundScores: [RoundScoreSummary]
    let benchmarkSummary: BenchmarkSummary
}

struct AftermathStanding: Codable, Identifiable {
    let agentId: String
    let total: Int
    let winnerShare: Double

    var id: String { agentId }
}

struct EliminationBeat: Codable, Identifiable {
    let round: Int
    let agentId: String

    var id: String {
        "r\(round)-\(agentId)"
    }
}

struct CountSummary: Codable {
    let total: Int
    let byType: [String: Int]
}

struct DivergenceSummary: Codable {
    let total: Int
    let byComparison: [String: Int]
    let byOutcome: [String: Int]
}

struct ReplayMarkerSummary: Codable {
    let total: Int
    let byType: [String: Int]
    let labels: [String]
}

struct RoundScoreSummary: Codable, Identifiable {
    let round: Int
    let deltas: [String: Int]

    var id: Int { round }
}

private struct ControlProjectionDocument: Codable {
    let manifest: ProjectionManifest
    let benchmarkSummary: BenchmarkSummary
    let home: HomeSummary
    let callsheet: [CallsheetRow]
    let layeredSnapshots: [LayeredSnapshot]
    let replay: ReplayProjection
    let aftermath: AftermathReport
}

private struct LiveProjectionDocument: Codable {
    let manifest: ProjectionManifest
    let home: HomeSummary
    let callsheet: [CallsheetRow]
    let layeredSnapshots: [LayeredSnapshot]
    let replay: ReplayProjection
    let live: LiveProjectionSummary
}
