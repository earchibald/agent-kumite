import SwiftUI

struct HomeDashboardView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    private let columns = [
        GridItem(.adaptive(minimum: 180), spacing: 12),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(projection.manifest.runId)
                    .font(.title2.weight(.semibold))

                LazyVGrid(columns: columns, spacing: 12) {
                    MetricCardView(
                        title: "Condition",
                        value: projection.home.condition,
                        caption: projection.home.currentCursor.label
                    )
                    MetricCardView(
                        title: "Agents",
                        value: "\(projection.home.survivingAgentCount) alive / \(projection.home.eliminatedAgentCount) out",
                        caption: projection.kind.displayTitle
                    )
                    MetricCardView(
                        title: "Alerts",
                        value: "\(projection.home.activeAlertCount)",
                        caption: "Active alert count"
                    )
                    MetricCardView(
                        title: "Awaiting",
                        value: "\(projection.home.openAwaitCount)",
                        caption: "Open human-action items"
                    )
                    MetricCardView(
                        title: "Replay",
                        value: "\(projection.replay.markerCount) markers",
                        caption: "\(projection.replay.snapshotCount) snapshots"
                    )
                    MetricCardView(
                        title: "Validity",
                        value: projection.manifest.validityStatus.capitalized,
                        caption: projection.manifest.operatorAffordanceSet ?? "No affordance label"
                    )
                }

                GroupBox("Latest Marker") {
                    if let latestMarker = projection.latestMarker {
                        Button {
                            onInspect(.marker(latestMarker))
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(latestMarker.label)
                                    .font(.headline)
                                Text(latestMarker.cursor.label)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text("No replay markers are available yet.")
                            .foregroundStyle(.secondary)
                    }
                }

                GroupBox(projection.kind == .control ? "Benchmark Highlights" : "Live Summary") {
                    if let benchmarkSummary = projection.benchmarkSummary, benchmarkSummary.highlightLabels.isEmpty == false {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(benchmarkSummary.highlightLabels, id: \.self) { label in
                                Label(label, systemImage: "sparkles")
                            }
                        }
                    } else if let liveSummary = projection.live {
                        VStack(alignment: .leading, spacing: 10) {
                            LabeledContent("Match status", value: liveSummary.matchStatus.capitalized)
                            LabeledContent("Public events", value: "\(liveSummary.publicEventCount)")
                            LabeledContent("Interventions", value: "\(liveSummary.interventionCount)")
                        }
                    } else {
                        Text("No highlight labels are available in this projection.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(24)
        }
    }
}

struct CallsheetView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var selection: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Cast Callsheet")
                .font(.title2.weight(.semibold))

            Table(projection.callsheet, selection: $selection) {
                TableColumn("Seat") { row in
                    Text(row.seat.formatted())
                }
                .width(min: 44, ideal: 56)

                TableColumn("Agent") { row in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.displayName)
                        Text(row.agentId)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .width(min: 140, ideal: 180)

                TableColumn("Role") { row in
                    Text(row.role.capitalized)
                }

                TableColumn("Model") { row in
                    Text(row.modelBadge)
                }
                .width(min: 120, ideal: 160)

                TableColumn("Status") { row in
                    Text(row.status.capitalized)
                }

                TableColumn("Score") { row in
                    Text(row.scoreTotal.formatted())
                }

                TableColumn("Round Δ") { row in
                    Text(row.latestRoundDelta.formatted(.number.sign(strategy: .always())))
                }

                TableColumn("Alerts") { row in
                    Text(row.alertCount.formatted())
                }
            }
            .tableStyle(.bordered(alternatesRowBackgrounds: true))
            .frame(minHeight: 420)
        }
        .padding(24)
        .onChange(of: selection, initial: true) { _, newValue in
            let item = projection.callsheet.first(where: { $0.id == newValue }).map(InspectorItem.agent)
            onInspect(item)
        }
    }
}

struct LiveOpsView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Live Ops")
                    .font(.title2.weight(.semibold))

                if let snapshot = projection.latestLayeredSnapshot {
                    GroupBox("Current Layered Snapshot") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(snapshot.cursor.label)
                                .font(.headline)

                            LazyVGrid(
                                columns: [GridItem(.adaptive(minimum: 180), spacing: 12)],
                                spacing: 12
                            ) {
                                MetricCardView(
                                    title: "Public stream",
                                    value: "\(snapshot.publicStream.eventIds.count) events",
                                    caption: "\(snapshot.publicStream.markerIds.count) markers"
                                )
                                MetricCardView(
                                    title: "Private state",
                                    value: "\(snapshot.privateState.artifactIds.count) artifacts",
                                    caption: "\(snapshot.privateState.commitmentEnvelopeIds.count) commitment envelopes"
                                )
                                MetricCardView(
                                    title: "Alerts",
                                    value: "\(snapshot.alerts.activeAlertIds.count) active",
                                    caption: "\(snapshot.alerts.alertIds.count) total"
                                )
                                MetricCardView(
                                    title: "Intervention queue",
                                    value: "\(snapshot.interventionQueue.pendingInterventionIds.count) pending",
                                    caption: "\(snapshot.interventionQueue.disabledPhaseOnePlaceholders.count) disabled placeholders"
                                )
                            }
                        }
                    }
                } else {
                    ContentUnavailableView(
                        "No Layered Snapshot",
                        systemImage: "waveform.path.ecg",
                        description: Text("This projection does not include any layered snapshot data yet.")
                    )
                }

                GroupBox("Phase-One Placeholders") {
                    if let snapshot = projection.latestLayeredSnapshot {
                        Text(snapshot.interventionQueue.disabledPhaseOnePlaceholders.joined(separator: ", "))
                            .foregroundStyle(.secondary)
                    } else {
                        Text("No placeholders available.")
                            .foregroundStyle(.secondary)
                    }
                }

                if let liveSummary = projection.live {
                    GroupBox("Live Queue") {
                        VStack(alignment: .leading, spacing: 12) {
                            LabeledContent("Match status", value: liveSummary.matchStatus.capitalized)
                            LabeledContent("Open await ids", value: "\(liveSummary.openAwaitIds.count)")
                            LabeledContent("Intervention records", value: "\(liveSummary.interventionCount)")

                            if liveSummary.awaitingQueue.isEmpty {
                                Text("No open awaiting items.")
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(liveSummary.awaitingQueue) { item in
                                    Button {
                                        onInspect(.liveAwait(item))
                                    } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(item.prompt)
                                            Text("\(item.kind.capitalized) · \(item.status.capitalized)")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                } else {
                    GroupBox("Projection Mode") {
                        Text("Benchmark projections show artifact-backed layer counts here; live queue actions remain a follow-up.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(24)
        }
    }
}

struct ReplayLabView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var selectedMarkerId: String?
    @State private var selectedSnapshotId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Replay Lab")
                .font(.title2.weight(.semibold))

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 12)], spacing: 12) {
                MetricCardView(
                    title: "Timeline",
                    value: "\(projection.replay.timeline.count) cursors",
                    caption: "Ordered replay checkpoints"
                )
                MetricCardView(
                    title: "Snapshots",
                    value: "\(projection.replay.snapshotCount)",
                    caption: "Persisted reconstruction points"
                )
                MetricCardView(
                    title: "Markers",
                    value: "\(projection.replay.markerCount)",
                    caption: "Jump points and recap cues"
                )
            }

            VSplitView {
                GroupBox("Markers") {
                    if projection.replay.markers.isEmpty {
                        Text("No replay markers are available.")
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    } else {
                        List(projection.replay.markers, selection: $selectedMarkerId) { marker in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(marker.label)
                                Text("\(marker.cursor.label) · \(marker.markerType)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .tag(marker.id)
                        }
                    }
                }
                .frame(minHeight: 220)

                GroupBox("Snapshots") {
                    Table(projection.replay.snapshots, selection: $selectedSnapshotId) {
                        TableColumn("Cursor") { snapshot in
                            Text(snapshot.cursor.label)
                        }
                        .width(min: 180, ideal: 240)

                        TableColumn("Captured") { snapshot in
                            Text(snapshot.capturedAt)
                        }
                        .width(min: 180, ideal: 220)

                        TableColumn("Alive") { snapshot in
                            Text(snapshot.aliveAgentIds.count.formatted())
                        }

                        TableColumn("Awaiting") { snapshot in
                            Text(snapshot.openAwaitIds.count.formatted())
                        }
                    }
                    .tableStyle(.bordered(alternatesRowBackgrounds: true))
                }
                .frame(minHeight: 240)
            }
        }
        .padding(24)
        .onChange(of: selectedMarkerId, initial: true) { _, newValue in
            guard newValue != nil else {
                if selectedSnapshotId == nil {
                    onInspect(nil)
                }
                return
            }

            let item = projection.replay.markers.first(where: { $0.id == newValue }).map(InspectorItem.marker)
            onInspect(item)
        }
        .onChange(of: selectedSnapshotId, initial: true) { _, newValue in
            guard newValue != nil else {
                if selectedMarkerId == nil {
                    onInspect(nil)
                }
                return
            }

            let item = projection.replay.snapshots.first(where: { $0.id == newValue }).map(InspectorItem.snapshot)
            onInspect(item)
        }
    }
}

struct AftermathLedgerView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var selectedStandingId: String?

    var body: some View {
        if let aftermath = projection.aftermath {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Aftermath Ledger")
                        .font(.title2.weight(.semibold))

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 12)], spacing: 12) {
                        MetricCardView(
                            title: "Winners",
                            value: "\(aftermath.winners.count)",
                            caption: aftermath.winners.map(\.agentId).joined(separator: ", ")
                        )
                        MetricCardView(
                            title: "Eliminations",
                            value: "\(aftermath.eliminations.count)",
                            caption: "Logged elimination beats"
                        )
                        MetricCardView(
                            title: "Divergences",
                            value: "\(aftermath.divergenceSummary.total)",
                            caption: "Commitment vs reveal evidence"
                        )
                        MetricCardView(
                            title: "Replay markers",
                            value: "\(aftermath.replayMarkerSummary.total)",
                            caption: "Proof links in bundle"
                        )
                    }

                    GroupBox("Standings") {
                        Table(aftermath.standings, selection: $selectedStandingId) {
                            TableColumn("Agent") { standing in
                                Text(standing.agentId)
                            }
                            .width(min: 150, ideal: 180)

                            TableColumn("Score") { standing in
                                Text(standing.total.formatted())
                            }

                            TableColumn("Winner Share") { standing in
                                Text(standing.winnerShare.formatted(.percent.precision(.fractionLength(0))))
                            }
                        }
                        .tableStyle(.bordered(alternatesRowBackgrounds: true))
                        .frame(minHeight: 260)
                    }

                    GroupBox("Round Scores") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(aftermath.roundScores) { roundScore in
                                let summary = roundScore.deltas
                                    .sorted { $0.key < $1.key }
                                    .map { key, value in "\(key): \(value.formatted(.number.sign(strategy: .always())))" }
                                    .joined(separator: ", ")

                                Text("Round \(roundScore.round) — \(summary)")
                            }
                        }
                    }

                    GroupBox("Replay Proof Labels") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(aftermath.replayMarkerSummary.labels, id: \.self) { label in
                                Label(label, systemImage: "bookmark")
                            }
                        }
                    }
                }
                .padding(24)
            }
            .onChange(of: selectedStandingId, initial: true) { _, newValue in
                let item = aftermath.standings.first(where: { $0.id == newValue }).map(InspectorItem.standing)
                onInspect(item)
            }
        } else {
            ContentUnavailableView(
                "No Aftermath Yet",
                systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90",
                description: Text("Live projections do not include an aftermath ledger until the run has closed.")
            )
        }
    }
}

struct InspectorDetailView: View {
    let item: InspectorItem?

    var body: some View {
        ScrollView {
            if let item {
                switch item {
                case .agent(let row):
                    InspectorSection(title: row.displayName, subtitle: row.agentId) {
                        LabeledContent("Seat", value: row.seat.formatted())
                        LabeledContent("Role", value: row.role.capitalized)
                        LabeledContent("Model", value: row.modelBadge)
                        LabeledContent("Status", value: row.status.capitalized)
                        LabeledContent("Score total", value: row.scoreTotal.formatted())
                        LabeledContent("Round delta", value: row.latestRoundDelta.formatted(.number.sign(strategy: .always())))
                        LabeledContent("Commitments", value: row.commitmentCount.formatted())
                        LabeledContent("Private artifacts", value: row.privateArtifactCount.formatted())
                        LabeledContent("Alerts", value: row.alertCount.formatted())
                    }

                case .marker(let marker):
                    InspectorSection(title: marker.label, subtitle: marker.cursor.label) {
                        LabeledContent("Type", value: marker.markerType)
                        LabeledContent("Source records", value: marker.sourceRecordIds.count.formatted())
                        if let linkedAwaitId = marker.linkedAwaitId {
                            LabeledContent("Linked await", value: linkedAwaitId)
                        }
                    }

                case .snapshot(let snapshot):
                    InspectorSection(title: snapshot.cursor.label, subtitle: snapshot.snapshotId) {
                        LabeledContent("Captured", value: snapshot.capturedAt)
                        LabeledContent("Alive agents", value: snapshot.aliveAgentIds.count.formatted())
                        LabeledContent("Eliminated agents", value: snapshot.eliminatedAgentIds.count.formatted())
                        LabeledContent("Open await ids", value: snapshot.openAwaitIds.count.formatted())
                    }

                case .standing(let standing):
                    InspectorSection(title: standing.agentId, subtitle: "Aftermath standing") {
                        LabeledContent("Score", value: standing.total.formatted())
                        LabeledContent(
                            "Winner share",
                            value: standing.winnerShare.formatted(.percent.precision(.fractionLength(0)))
                        )
                    }

                case .liveAwait(let item):
                    InspectorSection(title: item.prompt, subtitle: item.awaitId) {
                        LabeledContent("Kind", value: item.kind.capitalized)
                        LabeledContent("Status", value: item.status.capitalized)
                        LabeledContent("Opened by", value: item.openedBy)
                        LabeledContent("Opened at", value: item.openedAt)
                        LabeledContent("Choices", value: item.choiceIds.joined(separator: ", "))
                        if let latestInterventionId = item.latestInterventionId {
                            LabeledContent("Latest intervention", value: latestInterventionId)
                        }
                    }
                }
            } else {
                ContentUnavailableView(
                    "Nothing Selected",
                    systemImage: "sidebar.right",
                    description: Text("Select a callsheet row, replay marker, snapshot, or aftermath standing to inspect it here.")
                )
                .frame(maxWidth: .infinity, minHeight: 240)
            }
        }
        .padding(20)
    }
}

private struct MetricCardView: View {
    let title: String
    let value: String
    let caption: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            Text(value)
                .font(.title3.weight(.semibold))
            Text(caption)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.quinary)
        .clipShape(.rect(cornerRadius: 12))
    }
}

private struct InspectorSection<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 10) {
                content
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
