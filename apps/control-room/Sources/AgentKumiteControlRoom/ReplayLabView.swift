import SwiftUI

struct ReplayLabView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var selectedMarkerId: String?
    @State private var selectedSnapshotId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            MissionHeroHeader(
                eyebrow: "Replay lab",
                title: "Recap, not log dump",
                subtitle: "Replay should make betrayal beats, eliminations, and proof inspectable without flattening the room into generic telemetry."
            )

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), spacing: 14)], spacing: 14) {
                MetricCardView(
                    title: "Timeline",
                    value: "\(projection.replay.timeline.count) stops",
                    caption: "Round and phase checkpoints",
                    accent: .purple
                )
                MetricCardView(
                    title: "Recap beats",
                    value: "\(projection.replay.markerCount)",
                    caption: "Markers worth scrubbing back to",
                    accent: .pink
                )
                MetricCardView(
                    title: "Proof snapshots",
                    value: "\(projection.replay.snapshotCount)",
                    caption: "Persisted reconstruction points",
                    accent: .teal
                )
            }

            MissionSection(
                title: "Recap reel",
                subtitle: "Expose the memorable beats first, then let the inspector prove them."
            ) {
                if projection.betrayalCallouts.isEmpty {
                    Text("No replay-worthy callouts have surfaced yet.")
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(projection.betrayalCallouts, id: \.self) { label in
                            Label(label, systemImage: "film.stack")
                        }
                    }
                }
            }

            VSplitView {
                MissionSection(title: "Marker ladder", subtitle: "Jump straight to exposed betrayals, reveals, eliminations, and match-point turns.") {
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
                        .animation(GameMotion.replayScrubAnimation, value: selectedMarkerId)
                    }
                }
                .frame(minHeight: 220)

                MissionSection(title: "Snapshot wall", subtitle: "Historical state should be scrubbable proof, not a second live store.") {
                    Table(projection.replay.snapshots, selection: $selectedSnapshotId) {
                        TableColumn("Cursor") { snapshot in
                            Text(snapshot.cursor.label)
                        }
                        .width(min: 180, ideal: 220)

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
        .background(ControlRoomBackdrop())
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
