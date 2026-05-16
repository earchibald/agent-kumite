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
