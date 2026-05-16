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
