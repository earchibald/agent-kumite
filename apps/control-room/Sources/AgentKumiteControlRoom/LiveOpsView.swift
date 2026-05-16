import SwiftUI

struct LiveOpsView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                MissionHeroHeader(
                    eyebrow: "Live ops",
                    title: projection.pressurePresentation.headline,
                    subtitle: "The live room should separate public stage, private whispers, alerts, and intervention work while still feeling like a match under pressure."
                )

                PressureBannerView(projection: projection)

                if let snapshot = projection.latestLayeredSnapshot {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 14)], spacing: 14) {
                        MissionSection(title: "Public stage", subtitle: "The broadcastable chronology and official replay pins.") {
                            LayerCountListView(
                                rows: [
                                    ("Events on stage", "\(snapshot.publicStream.eventIds.count)", "text.line.first.and.arrowtriangle.forward"),
                                    ("Replay pins", "\(snapshot.publicStream.markerIds.count)", "bookmark"),
                                    ("Latest beat", projection.latestMarker?.label ?? "No marker yet", "sparkles")
                                ]
                            )
                        }

                        MissionSection(title: "Private whispers", subtitle: "Hidden state stays inspectable, not ambient.") {
                            LayerCountListView(
                                rows: [
                                    ("Private artifacts", "\(snapshot.privateState.artifactIds.count)", "eye.slash"),
                                    ("Commitment envelopes", "\(snapshot.privateState.commitmentEnvelopeIds.count)", "tray.full"),
                                    ("Betrayal watch", projection.betrayalCallouts.first ?? "No exposed divergence yet", "theatermasks")
                                ]
                            )
                        }

                        MissionSection(title: "Alert rail", subtitle: "Sparse routing only when canonical state earns it.") {
                            LayerCountListView(
                                rows: [
                                    ("Active alerts", "\(snapshot.alerts.activeAlertIds.count)", "bell.badge"),
                                    ("Total alerts", "\(snapshot.alerts.alertIds.count)", "bell"),
                                    ("Room tone", snapshot.alerts.activeAlertIds.isEmpty ? "Quiet" : "Escalated", "waveform.path.ecg")
                                ]
                            )
                        }

                        MissionSection(title: "Intervention rail", subtitle: "Structured human action stays distinct from match narration.") {
                            LayerCountListView(
                                rows: [
                                    ("Pending queue", "\(snapshot.interventionQueue.pendingInterventionIds.count)", "person.crop.circle.badge.exclamationmark"),
                                    ("Disabled phase-one controls", "\(snapshot.interventionQueue.disabledPhaseOnePlaceholders.count)", "hand.raised.slash"),
                                    ("Open awaits", "\(projection.live?.openAwaitIds.count ?? projection.home.openAwaitCount)", "pause.circle")
                                ]
                            )
                        }
                    }

                    MissionSection(
                        title: "Pressure shell markers",
                        subtitle: "The room should telegraph when the match tightens, not just count JSON arrays."
                    ) {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(projection.replay.markers.prefix(4)) { marker in
                                Button {
                                    onInspect(.marker(marker))
                                } label: {
                                    HStack(alignment: .top, spacing: 10) {
                                        Image(systemName: "sparkle.magnifyingglass")
                                            .foregroundStyle(projection.pressurePresentation.color)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(marker.label)
                                            Text("\(marker.cursor.label) · \(marker.markerType)")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    ContentUnavailableView(
                        "No Layered Snapshot",
                        systemImage: "waveform.path.ecg",
                        description: Text("This projection does not include any live room snapshot data yet.")
                    )
                }

                if let liveSummary = projection.live {
                    MissionSection(
                        title: "Awaiting queue",
                        subtitle: "In C5, approvals and nudges belong here — not mixed into public narration."
                    ) {
                        if liveSummary.awaitingQueue.isEmpty {
                            Text("No open awaiting items. The room is currently observational.")
                                .foregroundStyle(.secondary)
                        } else {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(liveSummary.awaitingQueue) { item in
                                    Button {
                                        onInspect(.liveAwait(item))
                                    } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(item.prompt)
                                                .font(.headline)
                                            Text("\(item.kind.capitalized) · \(item.status.capitalized) · opened by \(item.openedBy)")
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
                }
            }
            .padding(24)
        }
        .background(ControlRoomBackdrop())
    }
}
