import Foundation
import Testing
@testable import AgentKumiteControlRoom

struct AgentKumiteControlRoomTests {
    @Test("Parses projection launch arguments")
    func parsesProjectionLaunchArguments() {
        let url = LaunchOptions.projectionURL(from: [
            "AgentKumiteControlRoom",
            "--projection",
            "/tmp/demo/control-room.json",
        ])

        #expect(url?.path == "/tmp/demo/control-room.json")
    }

    @Test("Ignores launch arguments without a projection flag")
    func ignoresMissingProjectionLaunchArguments() {
        let url = LaunchOptions.projectionURL(from: ["AgentKumiteControlRoom"])
        #expect(url == nil)
    }

    @Test("Decodes benchmark control-room projections")
    func decodesControlProjection() throws {
        let projection = try LoadedProjection.load(from: Data(controlProjectionJSON.utf8))

        #expect(projection.kind == ProjectionKind.control)
        #expect(projection.manifest.runId == "run_control")
        #expect(projection.benchmarkSummary?.roundsPlayed == 3)
        #expect(projection.aftermath?.standings.count == 1)
        #expect(projection.live == nil)
    }

    @Test("Decodes live control-room projections")
    func decodesLiveProjection() throws {
        let projection = try LoadedProjection.load(from: Data(liveProjectionJSON.utf8))

        #expect(projection.kind == ProjectionKind.live)
        #expect(projection.manifest.runId == "run_live")
        #expect(projection.live?.matchStatus == "live")
        #expect(projection.aftermath == nil)
        #expect(projection.benchmarkSummary == nil)
    }
}

struct ControlRoomScreenTests {
    @Test("Arena is the first screen and the static Home screen is gone")
    func arenaReplacesHome() {
        let screens = ControlRoomScreen.allCases
        #expect(screens.first == .arena)
        #expect(screens.contains { $0.rawValue == "home" } == false)
        #expect(screens.contains(.callsheet))
        #expect(screens.count == 5)
    }
}

struct PresentationStateTests {
    @Test("Empty beat list has no focus and cannot play")
    func emptyHasNoFocus() {
        var state = PresentationState(beatCount: 0)

        #expect(state.hasFocus == false)
        #expect(state.focusIndex == 0)
        #expect(state.isPlaying == false)

        state.play()
        #expect(state.isPlaying == false)
    }

    @Test("Non-empty beat list starts focused on the first beat")
    func startsOnFirstBeat() {
        let state = PresentationState(beatCount: 5)

        #expect(state.hasFocus)
        #expect(state.focusIndex == 0)
        #expect(state.isAtEnd == false)
    }

    @Test("Stepping forward advances one focal beat at a time")
    func stepForwardAdvances() {
        var state = PresentationState(beatCount: 3)

        state.stepForward()
        #expect(state.focusIndex == 1)

        state.stepForward()
        #expect(state.focusIndex == 2)
        #expect(state.isAtEnd)
    }

    @Test("Stepping forward at the last beat clamps and halts playback")
    func stepForwardAtEndHalts() {
        var state = PresentationState(beatCount: 2)
        state.play()
        state.stepForward()

        #expect(state.focusIndex == 1)
        #expect(state.isAtEnd)

        state.stepForward()
        #expect(state.focusIndex == 1)
        #expect(state.isPlaying == false)
    }

    @Test("Stepping backward retreats and clamps at the first beat")
    func stepBackwardClamps() {
        var state = PresentationState(beatCount: 3)
        state.jump(to: 2)

        state.stepBackward()
        #expect(state.focusIndex == 1)

        state.stepBackward()
        state.stepBackward()
        #expect(state.focusIndex == 0)
    }

    @Test("Jumping clamps out-of-range targets into the valid range")
    func jumpClamps() {
        var state = PresentationState(beatCount: 4)

        state.jump(to: 99)
        #expect(state.focusIndex == 3)

        state.jump(to: -5)
        #expect(state.focusIndex == 0)
    }

    @Test("Play and pause toggle staged playback")
    func playPauseToggles() {
        var state = PresentationState(beatCount: 3)

        state.play()
        #expect(state.isPlaying)

        state.pause()
        #expect(state.isPlaying == false)
    }

    @Test("Reset returns focus to the first beat and stops playback")
    func resetReturnsToStart() {
        var state = PresentationState(beatCount: 5)
        state.jump(to: 4)
        state.play()

        state.reset()
        #expect(state.focusIndex == 0)
        #expect(state.isPlaying == false)
    }

    @Test("Rebinding to a new projection clamps focus and stops playback")
    func rebindClampsAndStops() {
        var state = PresentationState(beatCount: 6)
        state.jump(to: 5)
        state.play()

        state.rebind(beatCount: 2)
        #expect(state.focusIndex == 1)
        #expect(state.isPlaying == false)

        state.rebind(beatCount: 0)
        #expect(state.hasFocus == false)
        #expect(state.focusIndex == 0)
    }
}

struct MotionSystemTests {
    @Test("Every motion vocabulary duration is positive")
    func vocabularyDurationsArePositive() {
        #expect(GameMotion.spotlightHandoff > 0)
        #expect(GameMotion.shellContraction > 0)
        #expect(GameMotion.eventPulse > 0)
        #expect(GameMotion.betrayalFlash > 0)
        #expect(GameMotion.replayScrub > 0)
        #expect(GameMotion.aftermathStaggerStep > 0)
        #expect(GameMotion.aftermathStaggerCap >= GameMotion.aftermathStaggerStep)
    }

    @Test("Pressure band parses known labels and falls back to open")
    func pressureBandParsing() {
        #expect(PressureBand(label: "Open") == .open)
        #expect(PressureBand(label: "Tightening") == .tightening)
        #expect(PressureBand(label: "Pressurized") == .pressurized)
        #expect(PressureBand(label: "Knife-edge") == .knifeEdge)
        #expect(PressureBand(label: "nonsense") == .open)
    }

    @Test("Shell contraction intensity rises monotonically with pressure band")
    func shellContractionIntensityMonotonic() {
        let open = ShellContraction.intensity(forBand: .open)
        let tightening = ShellContraction.intensity(forBand: .tightening)
        let pressurized = ShellContraction.intensity(forBand: .pressurized)
        let knifeEdge = ShellContraction.intensity(forBand: .knifeEdge)

        #expect(open == 0.0)
        #expect(knifeEdge == 1.0)
        #expect(open < tightening)
        #expect(tightening < pressurized)
        #expect(pressurized < knifeEdge)
    }

    @Test("Aftermath sequencing delay grows per index and caps")
    func aftermathSequenceDelay() {
        #expect(AftermathSequence.delay(forIndex: 0) == 0)
        #expect(AftermathSequence.delay(forIndex: 1) == GameMotion.aftermathStaggerStep)
        #expect(AftermathSequence.delay(forIndex: 2) == GameMotion.aftermathStaggerStep * 2)
        #expect(AftermathSequence.delay(forIndex: 9999) == GameMotion.aftermathStaggerCap)
        #expect(AftermathSequence.delay(forIndex: -3) == 0)
    }

    @Test("Scrub direction derives from focus-index delta sign")
    func scrubDirectionFromDelta() {
        #expect(ScrubDirection.between(previousIndex: 1, currentIndex: 2) == .forward)
        #expect(ScrubDirection.between(previousIndex: 4, currentIndex: 1) == .backward)
        #expect(ScrubDirection.between(previousIndex: 3, currentIndex: 3) == .none)
    }

    @Test("Betrayal flash triggers only on betrayal-class marker types")
    func betrayalFlashTriggering() {
        #expect(BetrayalFlash.isTriggered(byMarkerType: "betrayal_exposed"))
        #expect(BetrayalFlash.isTriggered(byMarkerType: "commitment_divergence"))
        #expect(BetrayalFlash.isTriggered(byMarkerType: "private_reveal"))
        #expect(BetrayalFlash.isTriggered(byMarkerType: "elimination"))
        #expect(BetrayalFlash.isTriggered(byMarkerType: "DEADLOCK"))
        #expect(BetrayalFlash.isTriggered(byMarkerType: "round_scores_posted") == false)
        #expect(BetrayalFlash.isTriggered(byMarkerType: "phase_advance") == false)
    }

    @Test("Event pulse is gated on active alerts and strengthens with the band")
    func eventPulseGatingAndStrength() {
        #expect(EventPulse.isActive(activeAlertCount: 0) == false)
        #expect(EventPulse.isActive(activeAlertCount: 1))
        #expect(EventPulse.isActive(activeAlertCount: 9))

        let open = EventPulse.strength(forBand: .open)
        let knifeEdge = EventPulse.strength(forBand: .knifeEdge)
        #expect(open > 0)
        #expect(open < knifeEdge)
        #expect(knifeEdge == 1.0)
    }

    @Test("Cast entrance delay staggers per index and caps")
    func castEntranceDelay() {
        #expect(CastEntrance.delay(forIndex: 0) == 0)
        #expect(CastEntrance.delay(forIndex: 1) == GameMotion.castEntranceStep)
        #expect(CastEntrance.delay(forIndex: 3) == GameMotion.castEntranceStep * 3)
        #expect(CastEntrance.delay(forIndex: 9999) == GameMotion.castEntranceCap)
        #expect(CastEntrance.delay(forIndex: -2) == 0)
        #expect(GameMotion.castEntranceStep > 0)
        #expect(GameMotion.castEntranceCap >= GameMotion.castEntranceStep)
    }

    @Test("Event ticker window keeps a stable size and slides with focus")
    func eventTickerWindow() {
        // Empty timeline shows nothing.
        #expect(EventTickerWindow.indices(count: 0, focus: 0, radius: 2) == [])

        // Fewer markers than the window: show them all.
        #expect(EventTickerWindow.indices(count: 3, focus: 1, radius: 2) == [0, 1, 2])

        // Interior focus is centered in a full-size window.
        #expect(EventTickerWindow.indices(count: 10, focus: 5, radius: 2) == [3, 4, 5, 6, 7])

        // Window slides (not shrinks) when focus is near the start.
        #expect(EventTickerWindow.indices(count: 10, focus: 0, radius: 2) == [0, 1, 2, 3, 4])

        // Window slides (not shrinks) when focus is near the end.
        #expect(EventTickerWindow.indices(count: 10, focus: 9, radius: 2) == [5, 6, 7, 8, 9])

        // Out-of-range focus is clamped before windowing.
        #expect(EventTickerWindow.indices(count: 10, focus: 99, radius: 2) == [5, 6, 7, 8, 9])
        #expect(EventTickerWindow.indices(count: 10, focus: -4, radius: 2) == [0, 1, 2, 3, 4])
    }
}

struct PressureBandSelectionTests {
    @Test("Knife-edge when field is compressed or late round", arguments: [
        (2, 1), (1, 4), (4, 5), (3, 6),
    ])
    func knifeEdge(surviving: Int, round: Int) {
        #expect(PressureBandSelection.band(survivingAgentCount: surviving, round: round) == .knifeEdge)
    }

    @Test("Pressurized at the mid thresholds")
    func pressurized() {
        #expect(PressureBandSelection.band(survivingAgentCount: 3, round: 1) == .pressurized)
        #expect(PressureBandSelection.band(survivingAgentCount: 5, round: 3) == .pressurized)
    }

    @Test("Tightening from round two, Open before that")
    func tighteningAndOpen() {
        #expect(PressureBandSelection.band(survivingAgentCount: 6, round: 2) == .tightening)
        #expect(PressureBandSelection.band(survivingAgentCount: 6, round: 1) == .open)
    }

    @Test("Band severity is monotonic non-decreasing as the room tightens")
    func monotonic() {
        let order: [PressureBand] = [.open, .tightening, .pressurized, .knifeEdge]
        func rank(_ b: PressureBand) -> Int { order.firstIndex(of: b)! }
        var previous = 0
        for round in 1...6 {
            let current = rank(PressureBandSelection.band(survivingAgentCount: 6, round: round))
            #expect(current >= previous)
            previous = current
        }
    }
}

struct TensionGaugeTests {
    @Test("Tension percent rises monotonically with the band", arguments: [
        (PressureBand.open, PressureBand.tightening),
        (.tightening, .pressurized),
        (.pressurized, .knifeEdge),
    ])
    func monotonic(lower: PressureBand, higher: PressureBand) {
        #expect(TensionGauge.percent(forBand: lower) < TensionGauge.percent(forBand: higher))
    }

    @Test("Tension percent stays within 0...100")
    func bounded() {
        for band in PressureBand.allCases {
            let pct = TensionGauge.percent(forBand: band)
            #expect(pct >= 0 && pct <= 100)
        }
    }

    @Test("Tension percent preserves the legacy mapping", arguments: [
        (PressureBand.open, 24),
        (.tightening, 48),
        (.pressurized, 72),
        (.knifeEdge, 87),
    ])
    func legacyMapping(band: PressureBand, expected: Int) {
        #expect(TensionGauge.percent(forBand: band) == expected)
    }
}

private let controlProjectionJSON = #"""
{
  "manifest": {
    "runId": "run_control",
    "matchId": "match_control",
    "condition": "C4",
    "validityStatus": "valid"
  },
  "benchmarkSummary": {
    "roundsPlayed": 3,
    "winnerIds": ["agent-alpha"],
    "eliminatedAgentIds": ["agent-saboteur"],
    "totals": {
      "publicEvents": 12,
      "privateArtifacts": 1,
      "structuredCommitments": 2,
      "speechCommitmentLinks": 4,
      "commitmentDivergences": 3,
      "replayMarkers": 8,
      "alerts": 0,
      "interventions": 0
    },
    "highlightLabels": ["Round 3 scores posted"]
  },
  "home": {
    "runId": "run_control",
    "matchId": "match_control",
    "condition": "C4",
    "currentCursor": {
      "round": 3,
      "phase": "task_scoring_debrief"
    },
    "survivingAgentCount": 5,
    "eliminatedAgentCount": 1,
    "activeAlertCount": 0,
    "openAwaitCount": 0,
    "latestMarkerId": "marker_final",
    "latestMarkerLabel": "Round 3 scores posted"
  },
  "callsheet": [],
  "layeredSnapshots": [],
  "replay": {
    "timeline": [],
    "snapshots": [],
    "markers": [],
    "snapshotCount": 0,
    "markerCount": 0
  },
  "aftermath": {
    "winners": [
      {
        "agentId": "agent-alpha",
        "total": 14,
        "winnerShare": 1
      }
    ],
    "standings": [
      {
        "agentId": "agent-alpha",
        "total": 14,
        "winnerShare": 1
      }
    ],
    "eliminations": [],
    "interventionSummary": {
      "total": 0,
      "byType": {}
    },
    "divergenceSummary": {
      "total": 0,
      "byComparison": {},
      "byOutcome": {}
    },
    "replayMarkerSummary": {
      "total": 0,
      "byType": {},
      "labels": []
    },
    "roundScores": [],
    "benchmarkSummary": {
      "roundsPlayed": 3,
      "winnerIds": ["agent-alpha"],
      "eliminatedAgentIds": ["agent-saboteur"],
      "totals": {
        "publicEvents": 12,
        "privateArtifacts": 1,
        "structuredCommitments": 2,
        "speechCommitmentLinks": 4,
        "commitmentDivergences": 3,
        "replayMarkers": 8,
        "alerts": 0,
        "interventions": 0
      },
      "highlightLabels": ["Round 3 scores posted"]
    }
  }
}
"""#

private let liveProjectionJSON = #"""
{
  "manifest": {
    "runId": "run_live",
    "matchId": "match_live",
    "condition": "C5",
    "validityStatus": "valid"
  },
  "home": {
    "runId": "run_live",
    "matchId": "match_live",
    "condition": "C5",
    "currentCursor": {
      "round": 3,
      "phase": "task_submission"
    },
    "survivingAgentCount": 6,
    "eliminatedAgentCount": 0,
    "activeAlertCount": 0,
    "openAwaitCount": 0,
    "latestMarkerId": "marker_live",
    "latestMarkerLabel": "resolved: await_r3_task_approval"
  },
  "callsheet": [],
  "layeredSnapshots": [],
  "replay": {
    "timeline": [],
    "snapshots": [],
    "markers": [],
    "snapshotCount": 0,
    "markerCount": 0
  },
  "live": {
    "matchStatus": "live",
    "openAwaitIds": [],
    "awaitingQueue": [],
    "publicEventCount": 1,
    "interventionCount": 2
  }
}
"""#
