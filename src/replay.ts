import type {
  ControlRoomProjection,
  ControlRoomReplayMarker,
  ControlRoomReplaySnapshot,
  LayeredCursorSnapshot,
} from './projection.js';
import type { PhaseCursor, RoundPhase } from './schema.js';
import { ROUND_PHASE_ORDER } from './schema.js';

const PHASE_INDEX = new Map<RoundPhase, number>(ROUND_PHASE_ORDER.map((phase, index) => [phase, index]));

export type ReplayProjectionInput = Pick<
  ControlRoomProjection,
  'manifest' | 'home' | 'callsheet' | 'layeredSnapshots' | 'replay'
>;

export interface ReplayMarkerJump {
  marker: ControlRoomReplayMarker;
  resolvedCursor: PhaseCursor;
  resolvedSnapshotId: string | null;
  sourceRecordIds: string[];
}

export interface ReplayLayerDiff {
  added: string[];
  removed: string[];
}

export interface ReplayScoreChange {
  agentId: string;
  from: number;
  to: number;
  delta: number;
}

export interface ReplaySnapshotDiff {
  fromCursor: PhaseCursor;
  toCursor: PhaseCursor;
  fromSnapshotId: string | null;
  toSnapshotId: string | null;
  publicStream: {
    eventIds: ReplayLayerDiff;
    markerIds: ReplayLayerDiff;
  };
  privateState: {
    artifactIds: ReplayLayerDiff;
    commitmentEnvelopeIds: ReplayLayerDiff;
  };
  alerts: {
    alertIds: ReplayLayerDiff;
    activeAlertIds: ReplayLayerDiff;
  };
  interventionQueue: {
    interventionIds: ReplayLayerDiff;
    pendingInterventionIds: ReplayLayerDiff;
  };
  stateChanges: {
    aliveAgentIds: ReplayLayerDiff;
    eliminatedAgentIds: ReplayLayerDiff;
    openAwaitIds: ReplayLayerDiff;
    scoreChanges: ReplayScoreChange[];
  };
}

function compareCursor(left: PhaseCursor, right: PhaseCursor): number {
  if (left.round !== right.round) {
    return left.round - right.round;
  }

  return (PHASE_INDEX.get(left.phase) ?? -1) - (PHASE_INDEX.get(right.phase) ?? -1);
}

function sortIds(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function diffIds(left: readonly string[], right: readonly string[]): ReplayLayerDiff {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return {
    added: sortIds([...rightSet].filter((value) => !leftSet.has(value))),
    removed: sortIds([...leftSet].filter((value) => !rightSet.has(value))),
  };
}

function nearestLayeredSnapshot(
  projection: ReplayProjectionInput,
  cursor: PhaseCursor,
): LayeredCursorSnapshot {
  const sorted = [...projection.layeredSnapshots].sort((left, right) => compareCursor(left.cursor, right.cursor));
  const found = sorted.filter((snapshot) => compareCursor(snapshot.cursor, cursor) <= 0).at(-1) ?? sorted[0];
  if (!found) {
    throw new Error('control-room projection has no layered snapshots');
  }

  return found;
}

function nearestReplaySnapshot(
  projection: ReplayProjectionInput,
  cursor: PhaseCursor,
): ControlRoomReplaySnapshot | null {
  return [...projection.replay.snapshots]
    .sort((left, right) => compareCursor(left.cursor, right.cursor))
    .filter((snapshot) => compareCursor(snapshot.cursor, cursor) <= 0)
    .at(-1) ?? null;
}

function timelineEndpoints(projection: ReplayProjectionInput): { first: PhaseCursor; last: PhaseCursor } {
  const first = projection.replay.timeline[0];
  const last = projection.replay.timeline.at(-1);
  if (!first || !last) {
    throw new Error('control-room projection has no replay timeline');
  }

  return { first, last };
}

function buildScoreChanges(
  fromSnapshot: ControlRoomReplaySnapshot | null,
  toSnapshot: ControlRoomReplaySnapshot | null,
): ReplayScoreChange[] {
  const agentIds = new Set<string>([
    ...Object.keys(fromSnapshot?.scoreByAgent ?? {}),
    ...Object.keys(toSnapshot?.scoreByAgent ?? {}),
  ]);

  return sortIds(agentIds)
    .map((agentId) => {
      const from = fromSnapshot?.scoreByAgent[agentId] ?? 0;
      const to = toSnapshot?.scoreByAgent[agentId] ?? 0;
      return { agentId, from, to, delta: to - from };
    })
    .filter((change) => change.delta !== 0);
}

export function findReplayMarkerJump(
  projection: ReplayProjectionInput,
  markerId: string,
): ReplayMarkerJump {
  const marker = projection.replay.markers.find((candidate) => candidate.markerId === markerId);
  if (!marker) {
    throw new Error(`unknown replay marker ${markerId}`);
  }

  const snapshot = nearestReplaySnapshot(projection, marker.cursor);
  return {
    marker,
    resolvedCursor: { ...marker.cursor },
    resolvedSnapshotId: snapshot?.snapshotId ?? null,
    sourceRecordIds: [...marker.sourceRecordIds],
  };
}

export function createReplaySnapshotDiff(
  projection: ReplayProjectionInput,
  fromCursor?: PhaseCursor,
  toCursor?: PhaseCursor,
): ReplaySnapshotDiff {
  const endpoints = timelineEndpoints(projection);
  const resolvedFrom = nearestLayeredSnapshot(projection, fromCursor ?? endpoints.first);
  const resolvedTo = nearestLayeredSnapshot(projection, toCursor ?? endpoints.last);

  if (compareCursor(resolvedFrom.cursor, resolvedTo.cursor) > 0) {
    throw new Error('from cursor must not be after to cursor');
  }

  const fromSnapshot = nearestReplaySnapshot(projection, resolvedFrom.cursor);
  const toSnapshot = nearestReplaySnapshot(projection, resolvedTo.cursor);

  return {
    fromCursor: { ...resolvedFrom.cursor },
    toCursor: { ...resolvedTo.cursor },
    fromSnapshotId: fromSnapshot?.snapshotId ?? null,
    toSnapshotId: toSnapshot?.snapshotId ?? null,
    publicStream: {
      eventIds: diffIds(resolvedFrom.publicStream.eventIds, resolvedTo.publicStream.eventIds),
      markerIds: diffIds(resolvedFrom.publicStream.markerIds, resolvedTo.publicStream.markerIds),
    },
    privateState: {
      artifactIds: diffIds(resolvedFrom.privateState.artifactIds, resolvedTo.privateState.artifactIds),
      commitmentEnvelopeIds: diffIds(
        resolvedFrom.privateState.commitmentEnvelopeIds,
        resolvedTo.privateState.commitmentEnvelopeIds,
      ),
    },
    alerts: {
      alertIds: diffIds(resolvedFrom.alerts.alertIds, resolvedTo.alerts.alertIds),
      activeAlertIds: diffIds(resolvedFrom.alerts.activeAlertIds, resolvedTo.alerts.activeAlertIds),
    },
    interventionQueue: {
      interventionIds: diffIds(
        resolvedFrom.interventionQueue.interventionIds,
        resolvedTo.interventionQueue.interventionIds,
      ),
      pendingInterventionIds: diffIds(
        resolvedFrom.interventionQueue.pendingInterventionIds,
        resolvedTo.interventionQueue.pendingInterventionIds,
      ),
    },
    stateChanges: {
      aliveAgentIds: diffIds(fromSnapshot?.aliveAgentIds ?? [], toSnapshot?.aliveAgentIds ?? []),
      eliminatedAgentIds: diffIds(fromSnapshot?.eliminatedAgentIds ?? [], toSnapshot?.eliminatedAgentIds ?? []),
      openAwaitIds: diffIds(fromSnapshot?.openAwaitIds ?? [], toSnapshot?.openAwaitIds ?? []),
      scoreChanges: buildScoreChanges(fromSnapshot, toSnapshot),
    },
  };
}

export function parseReplayCursor(value: string): PhaseCursor {
  const [roundText, phase] = value.split(':');
  const round = Number(roundText);
  if (!Number.isInteger(round) || round < 1) {
    throw new Error(`invalid replay cursor ${value}`);
  }

  if (!phase || !ROUND_PHASE_ORDER.includes(phase as RoundPhase)) {
    throw new Error(`invalid replay cursor ${value}`);
  }

  return {
    round,
    phase: phase as RoundPhase,
  };
}

export function normalizeControlRoomProjectionInput(value: unknown): ReplayProjectionInput {
  if (
    value
    && typeof value === 'object'
    && 'manifest' in value
    && 'home' in value
    && 'callsheet' in value
    && 'layeredSnapshots' in value
    && 'replay' in value
  ) {
    return value as ReplayProjectionInput;
  }

  throw new Error('input must be a control-room projection JSON');
}
