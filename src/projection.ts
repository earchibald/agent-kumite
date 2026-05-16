import type {
  AwaitRecord,
  AlertRecord,
  MatchState,
  ArtifactBundle,
  InterventionRecord,
  PhaseCursor,
  ReplayMarker,
  ReplaySnapshot,
  RosterEntry,
  RoundPhase,
  StructuredCommitmentEnvelope,
  RunManifest,
} from './schema.js';
import { ROUND_PHASE_ORDER } from './schema.js';
import { createAftermathReport, type AftermathReport } from './report.js';
import type { AcpIngressReducerState } from './acp-ingress-reducer.js';

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

export interface LiveAwaitingQueueItem {
  awaitId: string;
  kind: AwaitRecord['kind'];
  prompt: string;
  status: AwaitRecord['status'];
  openedAt: string;
  openedBy: string;
  choiceIds: string[];
  latestInterventionId: string | null;
}

export interface LiveControlRoomProjection {
  manifest: RunManifest;
  home: ControlRoomHomeSummary;
  callsheet: CallsheetRow[];
  layeredSnapshots: LayeredCursorSnapshot[];
  replay: ControlRoomProjection['replay'];
  live: {
    matchStatus: MatchState['status'];
    openAwaitIds: string[];
    awaitingQueue: LiveAwaitingQueueItem[];
    publicEventCount: number;
    interventionCount: number;
  };
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

function latestReplaySnapshotAtOrBefore(
  snapshots: readonly ReplaySnapshot[],
  cursor: PhaseCursor,
): ReplaySnapshot | null {
  return snapshots
    .filter((snapshot) => cursorAtOrBefore(snapshot.cursor, cursor))
    .at(-1) ?? null;
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

function currentRoundDeltaByAgent(snapshots: readonly ReplaySnapshot[]): Record<string, number> {
  const latestSnapshot = snapshots.at(-1);
  if (!latestSnapshot) {
    return {};
  }

  const round = latestSnapshot.cursor.round;
  const firstSnapshotThisRound = snapshots.find((snapshot) => snapshot.cursor.round === round) ?? latestSnapshot;
  const agentIds = new Set<string>([
    ...Object.keys(firstSnapshotThisRound.state.scoreByAgent),
    ...Object.keys(latestSnapshot.state.scoreByAgent),
  ]);

  return Object.fromEntries(
    [...agentIds].map((agentId) => [
      agentId,
      (latestSnapshot.state.scoreByAgent[agentId] ?? 0) - (firstSnapshotThisRound.state.scoreByAgent[agentId] ?? 0),
    ]),
  );
}

function buildLiveCallsheet(
  roster: readonly RosterEntry[],
  reduced: AcpIngressReducerState,
): CallsheetRow[] {
  const latestState = reduced.snapshots.at(-1)?.state ?? reduced.matchState;
  const roundDeltas = currentRoundDeltaByAgent(reduced.snapshots);
  const structuredCommitments = reduced.matchState.structuredCommitments;

  return roster.map((entry) => ({
    agentId: entry.agentId,
    displayName: entry.displayName,
    seat: entry.seat,
    role: entry.role,
    modelBadge: `${entry.modelFamily}:${entry.modelVersion}`,
    memoryEnabled: entry.memoryEnabled,
    status: (latestState.eliminatedAgentIds.includes(entry.agentId) ? 'eliminated' : 'alive') as 'alive' | 'eliminated',
    scoreTotal: latestState.scoreByAgent[entry.agentId] ?? 0,
    latestRoundDelta: roundDeltas[entry.agentId] ?? 0,
    commitmentCount: structuredCommitments
      .filter((envelope) => envelope.agentId === entry.agentId)
      .reduce((sum, envelope) => sum + envelope.commitments.length, 0),
    privateArtifactCount: 0,
    alertCount: 0,
  })).sort((left, right) => left.seat - right.seat);
}

function buildLiveReplayProjection(reduced: AcpIngressReducerState): ControlRoomProjection['replay'] {
  return {
    timeline: reduced.replayBundle.timeline.map((cursor) => ({ ...cursor })),
    snapshots: reduced.replayBundle.snapshots.map((snapshot) => ({
      snapshotId: snapshot.snapshotId,
      cursor: { ...snapshot.cursor },
      capturedAt: snapshot.capturedAt,
      aliveAgentIds: [...snapshot.state.aliveAgentIds],
      eliminatedAgentIds: [...snapshot.state.eliminatedAgentIds],
      openAwaitIds: [...snapshot.state.openAwaitIds],
      scoreByAgent: { ...snapshot.state.scoreByAgent },
    })),
    markers: reduced.replayBundle.markers.map((marker) => ({
      markerId: marker.markerId,
      cursor: { ...marker.cursor },
      markerType: marker.markerType,
      label: marker.label,
      sourceRecordIds: [...marker.sourceEventIds],
      linkedAwaitId: marker.linkedAwaitId ?? null,
    })),
    snapshotCount: reduced.replayBundle.snapshots.length,
    markerCount: reduced.replayBundle.markers.length,
    markerIds: reduced.replayBundle.markers.map((marker) => marker.markerId),
  };
}

function interventionQueueIdsAtCursor(
  interventions: readonly InterventionRecord[],
  openAwaitIds: readonly string[],
  cursor: PhaseCursor,
): string[] {
  const latestByAwaitId = new Map<string, InterventionRecord>();
  for (const intervention of interventions) {
    if (!cursorAtOrBefore(intervention.cursor, cursor)) {
      continue;
    }

    latestByAwaitId.set(intervention.awaitId, intervention);
  }

  return openAwaitIds.flatMap((awaitId) => {
    const intervention = latestByAwaitId.get(awaitId);
    return intervention ? [intervention.interventionId] : [];
  });
}

function buildLiveLayeredSnapshots(reduced: AcpIngressReducerState): LayeredCursorSnapshot[] {
  return reduced.replayBundle.timeline.map((cursor) => {
    const snapshot = latestReplaySnapshotAtOrBefore(reduced.snapshots, cursor);
    const openAwaitIds = snapshot?.state.openAwaitIds ?? [];
    const interventionIds = interventionQueueIdsAtCursor(reduced.interventions, openAwaitIds, cursor);

    return {
      cursor,
      publicStream: {
        eventIds: recordsAtCursor(reduced.publicEvents, cursor).map((event) => event.eventId),
        markerIds: recordsAtCursor(reduced.markers, cursor).map((marker) => marker.markerId),
      },
      privateState: {
        artifactIds: [],
        commitmentEnvelopeIds: reduced.matchState.structuredCommitments
          .filter((envelope) => shouldIncludeCommitmentEnvelope(envelope, cursor))
          .map((envelope) => envelope.envelopeId),
      },
      alerts: {
        alertIds: [],
        activeAlertIds: [],
      },
      interventionQueue: {
        interventionIds,
        pendingInterventionIds: [...interventionIds],
        disabledPhaseOnePlaceholders: [...DISABLED_PHASE_ONE_INTERVENTIONS],
      },
    };
  });
}

function buildLiveAwaitingQueue(reduced: AcpIngressReducerState): LiveAwaitingQueueItem[] {
  const latestInterventionByAwaitId = new Map<string, InterventionRecord>();
  for (const intervention of reduced.interventions) {
    latestInterventionByAwaitId.set(intervention.awaitId, intervention);
  }

  return reduced.awaitRecords
    .filter((record) => reduced.matchState.openAwaitIds.includes(record.awaitId))
    .map((record) => ({
      awaitId: record.awaitId,
      kind: record.kind,
      prompt: record.prompt,
      status: record.status,
      openedAt: record.openedAt,
      openedBy: record.openedBy,
      choiceIds: record.choices.map((choice) => choice.choiceId),
      latestInterventionId: latestInterventionByAwaitId.get(record.awaitId)?.interventionId ?? null,
    }));
}

function buildLiveHomeSummary(
  manifest: RunManifest,
  reduced: AcpIngressReducerState,
): ControlRoomHomeSummary {
  const marker = latestMarker(reduced.markers);

  return {
    runId: manifest.runId,
    matchId: manifest.matchId,
    condition: manifest.condition,
    currentCursor: { ...reduced.matchState.current },
    survivingAgentCount: reduced.matchState.aliveAgentIds.length,
    eliminatedAgentCount: reduced.matchState.eliminatedAgentIds.length,
    activeAlertCount: 0,
    openAwaitCount: reduced.matchState.openAwaitIds.length,
    latestMarkerId: marker?.markerId ?? null,
    latestMarkerLabel: marker?.label ?? null,
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

export interface LiveControlRoomProjectionInput {
  manifest: RunManifest;
  roster: readonly RosterEntry[];
  reduced: AcpIngressReducerState;
}

export function createLiveControlRoomProjection(
  input: LiveControlRoomProjectionInput,
): LiveControlRoomProjection {
  return {
    manifest: input.manifest,
    home: buildLiveHomeSummary(input.manifest, input.reduced),
    callsheet: buildLiveCallsheet(input.roster, input.reduced),
    layeredSnapshots: buildLiveLayeredSnapshots(input.reduced),
    replay: buildLiveReplayProjection(input.reduced),
    live: {
      matchStatus: input.reduced.matchState.status,
      openAwaitIds: [...input.reduced.matchState.openAwaitIds],
      awaitingQueue: buildLiveAwaitingQueue(input.reduced),
      publicEventCount: input.reduced.publicEvents.length,
      interventionCount: input.reduced.interventions.length,
    },
  };
}
