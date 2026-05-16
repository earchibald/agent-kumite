import SwiftUI

// MARK: - Arena composites

/// The pressure shell promoted to the centerpiece. Rings contract on the
/// canonical band and the cast walks on in a staged lineup.
struct CenterStageShell: View {
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

/// A sliding window of replay markers around the focal beat. The window slides
/// (not shrinks) with `EventTickerWindow`, derived purely from canonical focus.
struct EventTickerView: View {
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
struct CastLadderStrip: View {
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
struct ArenaTransportBar: View {
    let model: ControlRoomAppModel

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

// MARK: - Shared section scaffolding

struct MissionHeroHeader: View {
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

// MARK: - Shared leaf views

struct TagPillView: View {
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

struct StatPillView: View {
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

struct ControlRoomBackdrop: View {
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

// MARK: - Pressure shell visual

struct PressureShellVisualView: View {
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

// MARK: - Marquee grammar

/// One labeled capsule in a marquee pill row. `id` is the pill text: stable
/// across renders so pill-set changes can animate by identity. Pill texts are
/// distinct within a single marquee row.
struct MarqueePill: Identifiable {
    var id: String { text }
    let text: String
    let color: Color
}

/// Broadcast-style header shared by Arena, Live Ops and Replay. The screen
/// injects what it says (eyebrow / headline / copy / pills); the grammar owns
/// only how it looks. No mode branching lives here.
struct ArenaMarquee: View {
    let eyebrow: String
    let headline: String
    let copy: String
    let accent: Color
    let pills: [MarqueePill]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Text(headline)
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .foregroundStyle(accent)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(copy)
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                ForEach(pills) { pill in
                    TagPillView(text: pill.text, color: pill.color)
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [accent.opacity(0.28), Color.black.opacity(0.12)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(.rect(cornerRadius: 20))
    }
}

/// The focal beat dramatized as a spotlight card. Owns its own motion
/// contract: a caller cannot reuse it and silently drop the scrub/handoff/
/// flash identity. Defaults keep static callers correct.
struct SpotlightBeatCard: View {
    let marker: ReplayMarker
    let projection: LoadedProjection
    var scrub: ScrubDirection = .none
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
        .id(marker.id)
        .spotlightHandoff(id: marker.id)
        .replayScrub(direction: scrub, value: marker.id)
        .betrayalFlash(active: isReveal)
    }
}
