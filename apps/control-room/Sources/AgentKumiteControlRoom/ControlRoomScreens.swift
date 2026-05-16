import SwiftUI

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

