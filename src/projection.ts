import type {
  AlertRecord,
  ArtifactBundle,
  InterventionRecord,
  PhaseCursor,
  ReplayMarker,
  ReplaySnapshot,
  RosterEntry,
  RoundPhase,
  StructuredCommitmentEnvelope,
} from './schema.js';
import { ROUND_PHASE_ORDER } from './schema.js';
import { createAftermathReport, type AftermathReport } from './report.js';

const PHASE_INDEX = new Map<RoundPhase, number>(ROUND_PHASE_ORDER.map((phase, index) => [phase, index]));
const DISABLED_PHASE_ONE_INTERVENTIONS = ['role_change', 'freeze', 'ejection'] as const;

export interface ControlRoomHomeSummary {
  runId: string;
  matchId: string;
  condition: ArtifactBundle['manifest']['condition'];
  currentCursor: PhaseCursor;
  survivingAgentCount: number;
  eliminatedAgentCount: number;
  activeAlertCount: number;
  openAwaitCount: number;
  latestMarkerId: string | null;
  latestMarkerLabel: string | null;
}

export interface CallsheetRow {
  agentId: string;
  displayName: string;
  seat: number;
  role: RosterEntry['role'];
  modelBadge: string;
  memoryEnabled: boolean;
  status: 'alive' | 'eliminated';
  scoreTotal: number;
  latestRoundDelta: number;
  commitmentCount: number;
  privateArtifactCount: number;
  alertCount: number;
}

export interface LayeredCursorSnapshot {
  cursor: PhaseCursor;
  publicStream: {
    eventIds: string[];
    markerIds: string[];
  };
  privateState: {
    artifactIds: string[];
    commitmentEnvelopeIds: string[];
  };
  alerts: {
    alertIds: string[];
    activeAlertIds: string[];
  };
  interventionQueue: {
    interventionIds: string[];
    pendingInterventionIds: string[];
    disabledPhaseOnePlaceholders: string[];
  };
}

export interface ControlRoomReplaySnapshot {
  snapshotId: string;
  cursor: PhaseCursor;
  capturedAt: string;
  aliveAgentIds: string[];
  eliminatedAgentIds: string[];
  openAwaitIds: string[];
  scoreByAgent: Record<string, number>;
}

export interface ControlRoomReplayMarker {
  markerId: string;
  cursor: PhaseCursor;
  markerType: ReplayMarker['markerType'];
  label: string;
  sourceRecordIds: string[];
  linkedAwaitId: string | null;
}

export interface ControlRoomProjection {
  manifest: ArtifactBundle['manifest'];
  benchmarkSummary: ArtifactBundle['benchmarkSummary'];
  home: ControlRoomHomeSummary;
  callsheet: CallsheetRow[];
  layeredSnapshots: LayeredCursorSnapshot[];
  replay: {
    timeline: PhaseCursor[];
    snapshots: ControlRoomReplaySnapshot[];
    markers: ControlRoomReplayMarker[];
    snapshotCount: number;
    markerCount: number;
    markerIds: string[];
  };
  aftermath: AftermathReport;
}

function compareCursor(left: PhaseCursor, right: PhaseCursor): number {
  if (left.round !== right.round) {
    return left.round - right.round;
  }

  return (PHASE_INDEX.get(left.phase) ?? -1) - (PHASE_INDEX.get(right.phase) ?? -1);
}

function cursorAtOrBefore(left: PhaseCursor, right: PhaseCursor): boolean {
  return compareCursor(left, right) <= 0;
}

function latestCursor(bundle: ArtifactBundle): PhaseCursor {
  return bundle.replayBundle.timeline[bundle.replayBundle.timeline.length - 1] ?? { round: 1, phase: 'cast_intro' };
}

function latestMarker(markers: readonly ReplayMarker[]): ReplayMarker | null {
  return [...markers].sort((left, right) => compareCursor(left.cursor, right.cursor))[markers.length - 1] ?? null;
}

function finalReplaySnapshot(bundle: ArtifactBundle): ReplaySnapshot | null {
  return bundle.replayBundle.snapshots[bundle.replayBundle.snapshots.length - 1] ?? null;
}

function shouldIncludeCommitmentEnvelope(
  envelope: StructuredCommitmentEnvelope,
  cursor: PhaseCursor,
): boolean {
  if (envelope.round < cursor.round) {
    return true;
  }

  if (envelope.round > cursor.round) {
    return false;
  }

  return (PHASE_INDEX.get(cursor.phase) ?? -1) >= (PHASE_INDEX.get('structured_commitment_submission') ?? 0);
}

function agentSourceIds(bundle: ArtifactBundle, agentId: string): Set<string> {
  const ids = new Set<string>();

  for (const event of bundle.publicEvents) {
    if (event.actorAgentIds.includes(agentId)) {
      ids.add(event.eventId);
    }
  }

  for (const artifact of bundle.privateArtifacts) {
    if (artifact.agentId === agentId) {
      ids.add(artifact.artifactId);
    }
  }

  for (const envelope of bundle.structuredCommitments) {
    if (envelope.agentId === agentId) {
      ids.add(envelope.envelopeId);
      for (const commitment of envelope.commitments) {
        ids.add(commitment.commitmentId);
      }
    }
  }

  return ids;
}

function buildCallsheet(bundle: ArtifactBundle): CallsheetRow[] {
  const finalState = finalReplaySnapshot(bundle)?.state;
  const scoreByAgent = new Map(bundle.finalScores.map((row) => [row.agentId, row]));

  return bundle.roster.map((entry) => {
    const agentIds = agentSourceIds(bundle, entry.agentId);
    const scoreRow = scoreByAgent.get(entry.agentId);
    const alertCount = bundle.alerts.filter((alert) =>
      alert.sourceRecordIds.some((sourceRecordId) => agentIds.has(sourceRecordId)),
    ).length;

    return {
      agentId: entry.agentId,
      displayName: entry.displayName,
      seat: entry.seat,
      role: entry.role,
      modelBadge: `${entry.modelFamily}:${entry.modelVersion}`,
      memoryEnabled: entry.memoryEnabled,
      status: (finalState?.eliminatedAgentIds.includes(entry.agentId) ? 'eliminated' : 'alive') as 'alive' | 'eliminated',
      scoreTotal: scoreRow?.total ?? 0,
      latestRoundDelta: scoreRow?.roundDeltas[scoreRow.roundDeltas.length - 1] ?? 0,
      commitmentCount: bundle.structuredCommitments
        .filter((envelope) => envelope.agentId === entry.agentId)
        .reduce((sum, envelope) => sum + envelope.commitments.length, 0),
      privateArtifactCount: bundle.privateArtifacts.filter((artifact) => artifact.agentId === entry.agentId).length,
      alertCount,
    };
  }).sort((left, right) => left.seat - right.seat);
}

function recordsAtCursor<T extends { cursor: PhaseCursor }>(records: readonly T[], cursor: PhaseCursor): T[] {
  return records.filter((record) => cursorAtOrBefore(record.cursor, cursor));
}

function buildLayeredSnapshots(bundle: ArtifactBundle): LayeredCursorSnapshot[] {
  return bundle.replayBundle.timeline.map((cursor) => {
    const alertsAtCursor = recordsAtCursor(bundle.alerts, cursor);
    const interventionsAtCursor = recordsAtCursor(bundle.interventions, cursor);

    return {
      cursor,
      publicStream: {
        eventIds: recordsAtCursor(bundle.publicEvents, cursor).map((event) => event.eventId),
        markerIds: recordsAtCursor(bundle.replayBundle.markers, cursor).map((marker) => marker.markerId),
      },
      privateState: {
        artifactIds: recordsAtCursor(bundle.privateArtifacts, cursor).map((artifact) => artifact.artifactId),
        commitmentEnvelopeIds: bundle.structuredCommitments
          .filter((envelope) => shouldIncludeCommitmentEnvelope(envelope, cursor))
          .map((envelope) => envelope.envelopeId),
      },
      alerts: {
        alertIds: alertsAtCursor.map((alert) => alert.alertId),
        activeAlertIds: alertsAtCursor.filter((alert) => alert.status === 'active').map((alert) => alert.alertId),
      },
      interventionQueue: {
        interventionIds: interventionsAtCursor.map((intervention) => intervention.interventionId),
        pendingInterventionIds: interventionsAtCursor
          .filter((intervention) => intervention.status === 'pending')
          .map((intervention) => intervention.interventionId),
        disabledPhaseOnePlaceholders: [...DISABLED_PHASE_ONE_INTERVENTIONS],
      },
    };
  });
}

function buildHomeSummary(bundle: ArtifactBundle): ControlRoomHomeSummary {
  const finalState = finalReplaySnapshot(bundle)?.state;
  const marker = latestMarker(bundle.replayBundle.markers);

  return {
    runId: bundle.manifest.runId,
    matchId: bundle.manifest.matchId,
    condition: bundle.manifest.condition,
    currentCursor: latestCursor(bundle),
    survivingAgentCount: finalState?.aliveAgentIds.length ?? bundle.roster.length,
    eliminatedAgentCount: finalState?.eliminatedAgentIds.length ?? 0,
    activeAlertCount: bundle.alerts.filter((alert) => alert.status === 'active').length,
    openAwaitCount: finalState?.openAwaitIds.length ?? 0,
    latestMarkerId: marker?.markerId ?? null,
    latestMarkerLabel: marker?.label ?? null,
  };
}

function buildReplayProjection(bundle: ArtifactBundle): ControlRoomProjection['replay'] {
  return {
    timeline: bundle.replayBundle.timeline.map((cursor) => ({ ...cursor })),
    snapshots: bundle.replayBundle.snapshots.map((snapshot) => ({
      snapshotId: snapshot.snapshotId,
      cursor: { ...snapshot.cursor },
      capturedAt: snapshot.capturedAt,
      aliveAgentIds: [...snapshot.state.aliveAgentIds],
      eliminatedAgentIds: [...snapshot.state.eliminatedAgentIds],
      openAwaitIds: [...snapshot.state.openAwaitIds],
      scoreByAgent: { ...snapshot.state.scoreByAgent },
    })),
    markers: bundle.replayBundle.markers.map((marker) => ({
      markerId: marker.markerId,
      cursor: { ...marker.cursor },
      markerType: marker.markerType,
      label: marker.label,
      sourceRecordIds: [...marker.sourceEventIds],
      linkedAwaitId: marker.linkedAwaitId ?? null,
    })),
    snapshotCount: bundle.replayBundle.snapshots.length,
    markerCount: bundle.replayBundle.markers.length,
    markerIds: bundle.replayBundle.markers.map((marker) => marker.markerId),
  };
}

export function createControlRoomProjection(bundle: ArtifactBundle): ControlRoomProjection {
  return {
    manifest: bundle.manifest,
    benchmarkSummary: bundle.benchmarkSummary,
    home: buildHomeSummary(bundle),
    callsheet: buildCallsheet(bundle),
    layeredSnapshots: buildLayeredSnapshots(bundle),
    replay: buildReplayProjection(bundle),
    aftermath: createAftermathReport(bundle),
  };
}
