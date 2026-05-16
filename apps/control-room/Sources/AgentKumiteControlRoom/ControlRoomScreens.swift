import SwiftUI

/// The Arena scene — a single staged surface that reads like a spectator
/// broadcast of a live AI match. It absorbs the old static Home dashboard:
/// marquee, center-stage pressure shell with staged cast entrances, the
/// dramatized focal beat, a live event ticker, and a cast scoreboard. The
/// operator transport is kept but visually demoted below the show.
struct ArenaView: View {
    let projection: LoadedProjection
    @Bindable var model: ControlRoomAppModel

    private var markers: [ReplayMarker] {
        projection.replay.markers
    }

    @State private var scrubDirection: ScrubDirection = .none
    @State private var castEntered = false

    var body: some View {
        if model.presentation.hasFocus, model.presentation.focusIndex < markers.count {
            let focusIndex = model.presentation.focusIndex
            let marker = markers[focusIndex]
            let band = PressureBand(label: projection.pressurePresentation.band)

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    ArenaMarquee(
                        projection: projection,
                        beatNumber: focusIndex + 1,
                        beatCount: markers.count
                    )

                    CenterStageShell(
                        projection: projection,
                        band: band,
                        castEntered: castEntered
                    )

                    SpotlightBeatCard(marker: marker, projection: projection) {
                        model.inspect(.marker(marker))
                    }
                    .id(marker.id)
                    .spotlightHandoff(id: marker.id)
                    .replayScrub(direction: scrubDirection, value: focusIndex)
                    .betrayalFlash(active: BetrayalFlash.isTriggered(byMarkerType: marker.markerType))

                    EventTickerView(
                        markers: markers,
                        focusIndex: focusIndex,
                        accentColor: projection.pressurePresentation.color
                    ) { index in
                        model.focusBeat(at: index)
                    }

                    CastLadderStrip(
                        rows: projection.callsheet.sortedByPressure,
                        castEntered: castEntered
                    ) { row in
                        model.inspect(.agent(row))
                    }

                    ArenaTransportBar(model: model)
                }
                .padding(28)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(ControlRoomBackdrop())
            .onAppear { castEntered = true }
            .onChange(of: model.presentation.focusIndex) { oldValue, newValue in
                scrubDirection = ScrubDirection.between(
                    previousIndex: oldValue,
                    currentIndex: newValue
                )
            }
            .task(id: model.presentation.isPlaying) {
                guard model.presentation.isPlaying else { return }
                while model.presentation.isPlaying, model.presentation.isAtEnd == false {
                    try? await Task.sleep(for: .seconds(4))
                    if Task.isCancelled { return }
                    model.focusNextBeat()
                }
            }
        } else {
            ContentUnavailableView(
                "Arena Idle",
                systemImage: "sportscourt",
                description: Text("This projection has no replay beats yet. The Arena stages the match once the first beat lands.")
            )
            .background(ControlRoomBackdrop())
        }
    }
}

/// Broadcast-style header: the pressure band is the dominant read, with match
/// identity and the live beat counter as supporting copy.
private struct ArenaMarquee: View {
    let projection: LoadedProjection
    let beatNumber: Int
    let beatCount: Int

    var body: some View {
        let presentation = projection.pressurePresentation

        VStack(alignment: .leading, spacing: 10) {
            Text("LIVE · \(projection.home.condition.uppercased())")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Text(presentation.headline)
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .foregroundStyle(presentation.color)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(presentation.copy)
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                TagPillView(text: presentation.band, color: presentation.color)
                TagPillView(text: projection.home.currentCursor.label, color: .purple)
                TagPillView(text: "Beat \(beatNumber) / \(beatCount)", color: .cyan)
                TagPillView(text: "\(projection.home.survivingAgentCount) still in", color: .green)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [presentation.color.opacity(0.28), Color.black.opacity(0.12)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(.rect(cornerRadius: 20))
    }
}

/// The pressure shell promoted to the centerpiece. Rings contract on the
/// canonical band and the cast walks on in a staged lineup.
private struct CenterStageShell: View {
    let projection: LoadedProjection
    let band: PressureBand
    let castEntered: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Circle()
                    .fill(projection.pressurePresentation.color)
                    .frame(width: 12, height: 12)
                    .eventPulse(
                        active: EventPulse.isActive(activeAlertCount: projection.home.activeAlertCount),
                        strength: EventPulse.strength(forBand: band)
                    )
                Text("CENTER STAGE · THE SHELL")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("Tension \(projection.tensionPercent)%")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(projection.pressurePresentation.color)
            }

            PressureShellVisualView(
                rows: projection.callsheet.sortedByPressure,
                contraction: ShellContraction.intensity(forBand: band),
                castEntered: castEntered
            )
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 20))
    }
}

/// The focal beat dramatized as a spotlight card. Motion (handoff, scrub,
/// betrayal flash) is attached by the caller off canonical focus.
private struct SpotlightBeatCard: View {
    let marker: ReplayMarker
    let projection: LoadedProjection
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
    }
}

/// A sliding window of replay markers around the focal beat. The window slides
/// (not shrinks) with `EventTickerWindow`, derived purely from canonical focus.
private struct EventTickerView: View {
    let markers: [ReplayMarker]
    let focusIndex: Int
    let accentColor: Color
    let onSelect: (Int) -> Void

    var body: some View {
        let window = EventTickerWindow.indices(
            count: markers.count,
            focus: focusIndex,
            radius: 3
        )

        VStack(alignment: .leading, spacing: 10) {
            Text("LIVE EVENT TICKER")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(window, id: \.self) { index in
                        let marker = markers[index]
                        let isFocus = index == focusIndex
                        let isReveal = BetrayalFlash.isTriggered(byMarkerType: marker.markerType)

                        Button {
                            onSelect(index)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    if isReveal {
                                        Image(systemName: "bolt.fill")
                                            .font(.caption2)
                                    }
                                    Text("Beat \(index + 1)")
                                        .font(.caption2.weight(.semibold))
                                }
                                Text(marker.label)
                                    .font(.caption.weight(isFocus ? .bold : .regular))
                                    .lineLimit(2)
                                    .frame(width: 150, alignment: .leading)
                            }
                            .padding(12)
                            .background((isReveal ? Color.red : accentColor)
                                .opacity(isFocus ? 0.28 : 0.12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(accentColor, lineWidth: isFocus ? 2 : 0)
                            )
                            .clipShape(.rect(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.96)),
                            removal: .opacity
                        ))
                    }
                }
                .animation(GameMotion.replayScrubAnimation, value: focusIndex)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 18))
    }
}

/// Spectator scoreboard salvaged from the old Home left rail. Each card is
/// staged on with `castEntrance`, ordered by pressure rank.
private struct CastLadderStrip: View {
    let rows: [CallsheetRow]
    let castEntered: Bool
    let onInspect: (CallsheetRow) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CAST · LIVE LADDER")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        Button {
                            onInspect(row)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(row.seat). \(row.displayName)")
                                    .font(.headline)
                                Text("pressure \(row.pressureScore)")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(row.suspicionColor)
                                Text(row.ladderCopy)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            .frame(width: 200, alignment: .leading)
                            .padding(14)
                            .background(row.suspicionColor.opacity(0.14))
                            .clipShape(.rect(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                        .castEntrance(index: index, entered: castEntered)
                    }
                }
            }

            Text("shaded card = elimination risk · the room is closing in")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 18))
    }
}

/// Operator transport, intentionally demoted: compact, low-contrast, and last
/// on the surface so the scene reads spectator-first.
private struct ArenaTransportBar: View {
    @Bindable var model: ControlRoomAppModel

    var body: some View {
        HStack(spacing: 14) {
            Text("OPERATOR")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)

            Button {
                model.focusPreviousBeat()
            } label: {
                Image(systemName: "backward.end.fill")
            }
            .disabled(model.presentation.focusIndex == 0)

            Button {
                model.togglePlayback()
            } label: {
                Image(systemName: model.presentation.isPlaying ? "pause.fill" : "play.fill")
                    .frame(width: 20)
            }
            .disabled(model.presentation.isAtEnd && model.presentation.isPlaying == false)

            Button {
                model.focusNextBeat()
            } label: {
                Image(systemName: "forward.end.fill")
            }
            .disabled(model.presentation.isAtEnd)

            Divider()
                .frame(height: 18)

            Button("Restart") {
                model.resetPresentation()
            }

            Spacer()

            Text(model.presentation.isPlaying ? "Playing" : "Paused")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quinary)
        .clipShape(.rect(cornerRadius: 12))
    }
}

struct CallsheetView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var selection: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Swift Spectacle Concept — Cast Callsheet / Episode Opener")
                .font(.largeTitle.weight(.bold))

            ShellStrip(
                title: "Top Strip",
                items: [
                    "\(projection.home.matchId) • Episode Opener",
                    "Phase: \(projection.home.currentCursor.phase)",
                    "Soundtrack Cue: \(projection.pressurePresentation.band.lowercased())",
                    "Tension: \(projection.tensionPercent)%"
                ]
            )

            HSplitView {
                ShellPanel(title: "Left Rail — Cast Cards") {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(projection.callsheet) { row in
                                Button {
                                    selection = row.id
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("\(row.displayName) • \(row.modelBadge) • \(row.roleLabel)")
                                            .font(.headline)
                                        Text("Motif: \(row.roleMotif)   Rivalry: \(row.rivalLabel(in: projection.callsheet))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Text("Tag: \(row.tagline)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(12)
                                    .background(.quinary)
                                    .clipShape(.rect(cornerRadius: 10))
                                }
                                .buttonStyle(.plain)
                            }

                            Divider()
                            Text("Season Notes")
                                .font(.headline)
                            ForEach(projection.seasonNotes, id: \.self) { note in
                                Text(note)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .frame(minWidth: 260, idealWidth: 300)

                ShellPanel(title: "Center Stage — Rivalry Map / Selected Spotlight") {
                    VStack(alignment: .leading, spacing: 14) {
                        if let selectedRow = projection.callsheet.first(where: { $0.id == selection }) ?? projection.callsheet.first {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Hero Card — \(selectedRow.displayName)")
                                    .font(.headline)
                                Text("Model family: \(selectedRow.modelBadge)   Current role: \(selectedRow.roleLabel)")
                                Text("Public hook: \"\(selectedRow.publicHook)\"")
                                Text("Known tension: \(selectedRow.knownTension(in: projection.callsheet))")
                                    .foregroundStyle(.secondary)
                            }
                            .padding(14)
                            .background(.quinary)
                            .clipShape(.rect(cornerRadius: 12))
                            .id(selectedRow.id)
                            .spotlightHandoff(id: selectedRow.id)
                        }

                        RivalryWebView(rows: projection.callsheet)
                    }
                }
                .frame(minWidth: 430, idealWidth: 590)

                ShellPanel(title: "Right Rail — Stakes / Forecast") {
                    VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Pressure Forecast")
                                .font(.headline)
                            Text(projection.pressureForecast)
                        }

                        Divider()

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Model Mix")
                                .font(.headline)
                            ForEach(projection.modelMixLines, id: \.self) { line in
                                Text(line)
                            }
                        }

                        Divider()

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Alliance Hints")
                                .font(.headline)
                            ForEach(projection.allianceHints, id: \.self) { hint in
                                Text(hint)
                            }
                        }

                        Divider()

                        Text("Read this like a tournament poster: who is here, why they matter, and where the first sparks lie.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(minWidth: 280, idealWidth: 320)
            }

            ShellStrip(
                title: "Bottom Strip",
                items: [
                    "Benchmark stats live",
                    "Prior episode notes",
                    "Season ladder",
                    "Launch controls"
                ]
            )
        }
        .padding(24)
        .background(ControlRoomBackdrop())
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

struct AftermathLedgerView: View {
    let projection: LoadedProjection
    let onInspect: (InspectorItem?) -> Void

    @State private var selectedStandingId: String?
    @State private var storyAppeared = false

    var body: some View {
        if let aftermath = projection.aftermath {
            VStack(alignment: .leading, spacing: 18) {
                Text("Swift Spectacle Concept — Aftermath Ledger / Replay Storyboard")
                    .font(.largeTitle.weight(.bold))

                ShellStrip(
                    title: "Top Banner",
                    items: [
                        "Winner: \(aftermath.winners.map(\.agentId).joined(separator: ", "))",
                        "Headline: \(projection.aftermathHeadline)",
                        "Replay sting: \(projection.betrayalCallouts.first ?? "none")"
                    ]
                )

                HSplitView {
                    ShellPanel(title: "Story Timeline") {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(Array(projection.storyTimeline.enumerated()), id: \.offset) { index, beat in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Beat \(index + 1) — \(beat.title)")
                                        .font(.headline)
                                    Text(beat.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(.quinary)
                                .clipShape(.rect(cornerRadius: 10))
                                .aftermathSequenced(index: index, appeared: storyAppeared)
                            }

                            Text("Interpret this column as the episode recap.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(minWidth: 320, idealWidth: 420)

                    ShellPanel(title: "Replay Storyboard") {
                        VStack(alignment: .leading, spacing: 14) {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 12)], spacing: 12) {
                                ForEach(projection.storyboardFrames, id: \.title) { frame in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(frame.title)
                                            .font(.headline)
                                        Text(frame.subtitle)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 100, alignment: .topLeading)
                                    .padding(12)
                                    .background(.quinary)
                                    .clipShape(.rect(cornerRadius: 10))
                                }
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Superlatives / Replay Jumps")
                                    .font(.headline)
                                Text("Best Betrayal • Loudest Bluff • Cleanest Read")
                                Text("jump: cast intro / betrayal / elimination / win")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .frame(minWidth: 360, idealWidth: 470)

                    ShellPanel(title: "Right Drawer — Confessional / Proof") {
                        VStack(alignment: .leading, spacing: 14) {
                            if let selectedStanding = aftermath.standings.first(where: { $0.id == selectedStandingId }) ?? aftermath.standings.first {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Selected: \(selectedStanding.agentId)")
                                        .font(.headline)
                                    Text("\"\(projection.confessionalQuote(for: selectedStanding.agentId))\"")
                                    Text("agent-reported reasoning label visible")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .padding(12)
                                .background(.quinary)
                                .clipShape(.rect(cornerRadius: 10))
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Model-Family Compare")
                                    .font(.headline)
                                ForEach(projection.modelCompareLines, id: \.self) { line in
                                    Text(line)
                                }
                            }

                            Divider()

                            Text("Read this like the episode recap board. Narrative first, proof second, diffs only on demand.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(minWidth: 250, idealWidth: 300)
                }
            }
            .background(ControlRoomBackdrop())
            .onChange(of: selectedStandingId, initial: true) { _, newValue in
                let item = aftermath.standings.first(where: { $0.id == newValue }).map(InspectorItem.standing)
                onInspect(item)
            }
            .onAppear { storyAppeared = true }
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
                    InspectorSection(title: row.displayName, subtitle: "\(row.roleLabel) · seat \(row.seat)") {
                        LabeledContent("Stable id", value: row.agentId)
                        LabeledContent("Model badge", value: row.modelBadge)
                        LabeledContent("Status", value: row.statusLabel)
                        LabeledContent("Score total", value: row.scoreTotal.formatted())
                        LabeledContent("Round delta", value: row.latestRoundDelta.formatted(.number.sign(strategy: .always())))
                        LabeledContent("Commitments", value: row.commitmentCount.formatted())
                        LabeledContent("Private artifacts", value: row.privateArtifactCount.formatted())
                        LabeledContent("Alert count", value: row.alertCount.formatted())
                        LabeledContent("Story read", value: row.suspicionLabel)
                    }

                case .marker(let marker):
                    InspectorSection(title: marker.label, subtitle: marker.cursor.label) {
                        LabeledContent("Marker type", value: marker.markerType)
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
                        LabeledContent("Winner share", value: standing.winnerShare.formatted(.percent.precision(.fractionLength(0))))
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
                    description: Text("Select a cast member, replay beat, snapshot, or aftermath standing to inspect the proof behind the show layer.")
                )
                .frame(maxWidth: .infinity, minHeight: 240)
            }
        }
        .padding(20)
        .background(ControlRoomBackdrop())
    }
}

private struct MissionHeroView: View {
    let projection: LoadedProjection

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            MissionHeroHeader(
                eyebrow: "Arena control room",
                title: "A cast-driven arena for rivalry, betrayal, and operator spectacle",
                subtitle: projection.heroCopy
            )

            HStack(spacing: 10) {
                TagPillView(text: projection.home.condition, color: projection.pressurePresentation.color)
                TagPillView(text: projection.kind.displayTitle, color: .cyan)
                TagPillView(text: projection.home.currentCursor.label, color: .purple)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [projection.pressurePresentation.color.opacity(0.3), Color.black.opacity(0.15)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(.rect(cornerRadius: 18))
    }
}

private struct MissionHeroHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.largeTitle.weight(.bold))
            Text(subtitle)
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }
}

private struct MissionSection<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(subtitle)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: 16))
    }
}

private struct CastSpotlightCard: View {
    let row: CallsheetRow
    var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.displayName)
                        .font(.headline)
                    Text("Seat \(row.seat) · \(row.roleLabel)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
                TagPillView(text: row.statusLabel, color: row.statusColor)
            }

            Text(row.modelBadge)
                .font(.subheadline.monospaced())
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                StatPillView(label: "Score", value: row.scoreTotal.formatted(), color: .yellow)
                StatPillView(label: "Δ", value: row.latestRoundDelta.formatted(.number.sign(strategy: .always())), color: .orange)
            }

            HStack(spacing: 10) {
                TagPillView(text: row.roleMotif, color: .indigo)
                TagPillView(text: row.suspicionLabel, color: row.suspicionColor)
            }

            if expanded {
                Divider()
                VStack(alignment: .leading, spacing: 8) {
                    LabeledContent("Commitments", value: row.commitmentCount.formatted())
                    LabeledContent("Private artifacts", value: row.privateArtifactCount.formatted())
                    LabeledContent("Alerts", value: row.alertCount.formatted())
                    LabeledContent("Memory", value: row.memoryEnabled ? "On" : "Off")
                }
                .font(.caption)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(row.statusColor.opacity(0.14))
        .clipShape(.rect(cornerRadius: 14))
    }
}

private struct PressureBannerView: View {
    let projection: LoadedProjection

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Circle()
                .fill(projection.pressurePresentation.color)
                .frame(width: 14, height: 14)
                .padding(.top, 6)
                .eventPulse(
                    active: EventPulse.isActive(activeAlertCount: projection.home.activeAlertCount),
                    strength: EventPulse.strength(
                        forBand: PressureBand(label: projection.pressurePresentation.band)
                    )
                )

            VStack(alignment: .leading, spacing: 6) {
                Text(projection.pressurePresentation.headline)
                    .font(.title3.weight(.semibold))
                Text(projection.pressurePresentation.copy)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(projection.pressurePresentation.color.opacity(0.12))
        .clipShape(.rect(cornerRadius: 16))
    }
}

private struct LayerCountListView: View {
    let rows: [(String, String, String)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: row.2)
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.0)
                            .font(.subheadline.weight(.medium))
                        Text(row.1)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }
        }
    }
}

private struct MetricCardView: View {
    let title: String
    let value: String
    let caption: String
    var accent: Color = .accentColor

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
        .background(accent.opacity(0.14))
        .clipShape(.rect(cornerRadius: 12))
    }
}

private struct TagPillView: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(color.opacity(0.16))
            .clipShape(Capsule())
    }
}

private struct StatPillView: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(color.opacity(0.15))
        .clipShape(.rect(cornerRadius: 10))
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

private struct ControlRoomBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color.purple.opacity(0.08),
                Color.red.opacity(0.04),
                Color.black.opacity(0.02),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
    }

    private struct ShellStrip: View {
        let title: String
        let items: [String]

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.headline)
                HStack {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        if index > 0 {
                            Text("•")
                                .foregroundStyle(.secondary)
                        }
                        Text(item)
                    }
                    Spacer()
                }
                .font(.subheadline)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(.rect(cornerRadius: 14))
    }
    }

    private struct ShellPanel<Content: View>: View {
        let title: String
        @ViewBuilder let content: Content

        var body: some View {
            VStack(alignment: .leading, spacing: 14) {
                Text(title)
                    .font(.title3.weight(.semibold))
                content
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(.regularMaterial)
            .clipShape(.rect(cornerRadius: 16))
    }
    }

    private struct RivalryWebView: View {
        let rows: [CallsheetRow]

        var body: some View {
            GeometryReader { geometry in
                let points = rivalryPoints(in: geometry.size, count: min(rows.count, 4))

                ZStack {
                    ForEach(Array(zip(points.indices, points.dropFirst())), id: \.0) { index, point in
                        Path { path in
                            path.move(to: points[index])
                            path.addLine(to: point)
                        }
                        .stroke(style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                        .foregroundStyle(.secondary)
                    }

                    ForEach(Array(zip(rows.prefix(points.count), points)), id: \.0.id) { row, point in
                        VStack(spacing: 2) {
                            Text(row.displayName)
                                .font(.caption.weight(.semibold))
                            Text(row.roleLabel)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        .frame(width: 90, height: 90)
                        .background(.background)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(.primary, lineWidth: 2))
                        .position(point)
                    }

                    Text("Dashed edges = unstable trust • spotlight a node to read the rivalry")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .position(x: geometry.size.width / 2, y: geometry.size.height - 18)
            }
            }
            .frame(minHeight: 250)
            .padding(12)
            .background(.quinary)
            .clipShape(.rect(cornerRadius: 12))
        }

        private func rivalryPoints(in size: CGSize, count: Int) -> [CGPoint] {
            let base = [
                CGPoint(x: size.width * 0.22, y: size.height * 0.45),
                CGPoint(x: size.width * 0.46, y: size.height * 0.24),
                CGPoint(x: size.width * 0.76, y: size.height * 0.48),
                CGPoint(x: size.width * 0.48, y: size.height * 0.72),
            ]
            return Array(base.prefix(count))
    }
    }

    private struct PressureShellVisualView: View {
        let rows: [CallsheetRow]
        /// 0 = open shell at full radius, 1 = collapsed. Derived from the
        /// canonical pressure band, never a timer.
        var contraction: Double = 0
        /// One-shot flag: when it flips true the cast walks onto the shell in a
        /// staged lineup. Defaults true so non-staged callers are unaffected.
        var castEntered: Bool = true

        /// Rings lose up to 30% of their radius as the band tightens.
        private var shellScale: CGFloat {
            1 - 0.3 * CGFloat(min(max(contraction, 0), 1))
        }

        var body: some View {
            GeometryReader { geometry in
                let points = rivalryPoints(in: geometry.size, count: min(rows.count, 4))

                ZStack {
                    Circle()
                        .stroke(.primary, lineWidth: 3)
                        .frame(width: min(geometry.size.width, geometry.size.height) * 0.7 * shellScale)
                    Circle()
                        .stroke(style: StrokeStyle(lineWidth: 2, dash: [12, 8]))
                        .foregroundStyle(.secondary)
                        .frame(width: min(geometry.size.width, geometry.size.height) * 0.54 * shellScale)
                    Circle()
                        .stroke(style: StrokeStyle(lineWidth: 2, dash: [10, 8]))
                        .foregroundStyle(.tertiary)
                        .frame(width: min(geometry.size.width, geometry.size.height) * 0.36 * shellScale)

                    ForEach(Array(zip(rows.prefix(points.count), points).enumerated()), id: \.element.0.id) { index, pair in
                        let (row, point) = pair
                        VStack(spacing: 2) {
                            Text(row.displayName)
                                .font(.caption.weight(.semibold))
                            Text("\(row.pressureScore)")
                                .font(.caption2)
                        }
                        .frame(width: 78, height: 78)
                        .background(.background)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(row.suspicionColor, lineWidth: 3))
                        .castEntrance(index: index, entered: castEntered)
                        .position(point)
                    }

                    Text("SAFE WINDOW COLLAPSING")
                        .font(.headline)
                }
                .animation(GameMotion.shellContractionAnimation, value: contraction)
            }
            .frame(minHeight: 360)
            .padding(12)
            .background(.quinary)
            .clipShape(.rect(cornerRadius: 12))
        }

        private func rivalryPoints(in size: CGSize, count: Int) -> [CGPoint] {
            let base = [
                CGPoint(x: size.width * 0.28, y: size.height * 0.38),
                CGPoint(x: size.width * 0.68, y: size.height * 0.32),
                CGPoint(x: size.width * 0.62, y: size.height * 0.72),
                CGPoint(x: size.width * 0.38, y: size.height * 0.74),
            ]
            return Array(base.prefix(count))
        }
    }
private struct PressurePresentation {
    let band: String
    let headline: String
    let copy: String
    let color: Color
}

private extension LoadedProjection {
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
        if home.survivingAgentCount <= 2 || home.currentCursor.round >= 5 {
            return PressurePresentation(
                band: "Knife-edge",
                headline: "The room is at match point",
                copy: "Only the next decisive beat matters now: the field is compressed and the show layer should feel like it.",
                color: .red
            )
        }

        if home.survivingAgentCount <= 3 || home.currentCursor.round >= 3 {
            return PressurePresentation(
                band: "Pressurized",
                headline: "Betrayal and elimination are now live",
                copy: "Nomination thresholds are in play, reveal beats matter, and every replay pin should justify the rising pressure.",
                color: .orange
            )
        }

        if home.currentCursor.round >= 2 {
            return PressurePresentation(
                band: "Tightening",
                headline: "The shell is closing",
                copy: "Space is shrinking. The control room should telegraph closing options before it reaches a decisive reveal.",
                color: .yellow
            )
        }

        return PressurePresentation(
            band: "Open",
            headline: "The cast is still introducing itself",
            copy: "Early rounds should stay readable and quieter so later elimination and betrayal beats have room to land.",
            color: .blue
        )
    }

    var tensionPercent: Int {
        switch pressurePresentation.band {
        case "Knife-edge":
            87
        case "Pressurized":
            72
        case "Tightening":
            48
        default:
            24
        }
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

private extension CallsheetRow {
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

private extension Array where Element == CallsheetRow {
    var sortedByPressure: [CallsheetRow] {
        sorted {
            if $0.pressureScore != $1.pressureScore {
                return $0.pressureScore > $1.pressureScore
            }
            return $0.seat < $1.seat
        }
    }
}

private extension Array where Element == String {
    func uniqued() -> [String] {
        var seen = Set<String>()
        return filter { seen.insert($0).inserted }
    }
}
