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

                    CenterStageShell(
                        projection: projection,
                        band: band,
                        castEntered: castEntered
                    )

                    SpotlightBeatCard(marker: marker, projection: projection, scrub: scrubDirection) {
                        model.inspect(.marker(marker))
                    }

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

