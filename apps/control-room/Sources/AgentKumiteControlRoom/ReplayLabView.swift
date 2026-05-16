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
            .onChange(of: projection.manifest.runId) { _, _ in
                focusIndex = 0
                snapshotSelection = nil
                scrubDirection = .none
            }
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
            .onChange(of: projection.manifest.runId) { _, _ in
                focusIndex = 0
                snapshotSelection = nil
                scrubDirection = .none
            }
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
