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
