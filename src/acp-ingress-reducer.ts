import {
  createInitialMatchState,
  createReplayBundle,
  dmBudgetForRound,
  snapshotFromMatchState,
} from './engine.js';
import { normalizeAcpIngressEnvelope } from './acp-ingress.js';
import type {
  AcpIngressEnvelope,
  AwaitRecord,
  InterventionRecord,
  MatchState,
  PublicEvent,
  ReplayBundle,
  ReplayMarker,
  ReplaySnapshot,
  RosterEntry,
  RunManifest,
} from './schema.js';
import { validateAcpIngressEnvelope } from './validate.js';

export interface AcpIngressReducerInput {
  manifest: RunManifest;
  roster: readonly RosterEntry[];
  envelopes: readonly AcpIngressEnvelope[];
}

export interface AcpIngressReducerState {
  matchState: MatchState;
  awaitRecords: AwaitRecord[];
  publicEvents: PublicEvent[];
  interventions: InterventionRecord[];
  markers: ReplayMarker[];
  snapshots: ReplaySnapshot[];
  replayBundle: ReplayBundle;
}

function defaultInitialTimestamp(envelopes: readonly AcpIngressEnvelope[]): string {
  return envelopes[0]?.timestamp ?? '2026-05-15T00:00:00Z';
}

function seedStateToIngressStart(
  state: MatchState,
  envelopes: readonly AcpIngressEnvelope[],
): MatchState {
  const firstRound = envelopes[0]?.cursor.round;
  if (!firstRound || firstRound === 1) {
    return state;
  }

  const budget = dmBudgetForRound(firstRound);
  return {
    ...state,
    current: {
      round: firstRound,
      phase: 'cast_intro',
    },
    dmBudgetByAgent: Object.fromEntries(
      state.aliveAgentIds.map((agentId) => [agentId, budget]),
    ),
  };
}

function upsertAwaitRecord(records: readonly AwaitRecord[], nextRecord: AwaitRecord): AwaitRecord[] {
  const existingIndex = records.findIndex((record) => record.awaitId === nextRecord.awaitId);
  if (existingIndex === -1) {
    return [...records, nextRecord];
  }

  return records.map((record, index) => (index === existingIndex ? nextRecord : record));
}

function updateAwaitRecordStatus(
  records: readonly AwaitRecord[],
  intervention: InterventionRecord,
): AwaitRecord[] {
  return records.map((record) => (
    record.awaitId === intervention.awaitId
      ? { ...record, status: intervention.status }
      : record
  ));
}

function appendUniqueId(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function removeId(values: readonly string[], value: string): string[] {
  return values.filter((current) => current !== value);
}

function applyEnvelopeToState(
  state: AcpIngressReducerState,
  envelope: AcpIngressEnvelope,
): AcpIngressReducerState {
  const errors = validateAcpIngressEnvelope(envelope);
  if (errors.length > 0) {
    throw new Error(`ACP ingress envelope ${envelope.envelopeId} is invalid: ${errors.join('; ')}`);
  }

  if (envelope.runId !== state.matchState.runId) {
    throw new Error(`ACP ingress envelope ${envelope.envelopeId} has runId ${envelope.runId} but reducer runId is ${state.matchState.runId}`);
  }

  if (envelope.matchId !== state.matchState.matchId) {
    throw new Error(`ACP ingress envelope ${envelope.envelopeId} has matchId ${envelope.matchId} but reducer matchId is ${state.matchState.matchId}`);
  }

  const normalized = normalizeAcpIngressEnvelope(envelope);
  let nextAwaitRecords = [...state.awaitRecords];
  let nextPublicEvents = [...state.publicEvents];
  let nextInterventions = [...state.interventions];
  let nextMarkers = [...state.markers];

  let nextMatchState: MatchState = {
    ...state.matchState,
    current: { ...envelope.cursor },
  };

  if (normalized.publicEvent) {
    nextPublicEvents.push(normalized.publicEvent);
    nextMatchState = {
      ...nextMatchState,
      layers: {
        ...nextMatchState.layers,
        publicEventIds: appendUniqueId(nextMatchState.layers.publicEventIds, normalized.publicEvent.eventId),
      },
    };
  }

  if (normalized.awaitRecord) {
    nextAwaitRecords = upsertAwaitRecord(nextAwaitRecords, normalized.awaitRecord);
    nextMatchState = {
      ...nextMatchState,
      status: 'paused',
      openAwaitIds: appendUniqueId(nextMatchState.openAwaitIds, normalized.awaitRecord.awaitId),
      layers: {
        ...nextMatchState.layers,
        interventionQueueIds: appendUniqueId(
          nextMatchState.layers.interventionQueueIds,
          normalized.awaitRecord.awaitId,
        ),
      },
    };
  }

  if (normalized.interventionRecord) {
    nextInterventions.push(normalized.interventionRecord);
    if (normalized.interventionRecord.status !== 'pending') {
      nextAwaitRecords = updateAwaitRecordStatus(nextAwaitRecords, normalized.interventionRecord);
      const openAwaitIds = removeId(nextMatchState.openAwaitIds, normalized.interventionRecord.awaitId);
      nextMatchState = {
        ...nextMatchState,
        status: openAwaitIds.length > 0 ? 'paused' : 'live',
        openAwaitIds,
        layers: {
          ...nextMatchState.layers,
          interventionQueueIds: removeId(
            nextMatchState.layers.interventionQueueIds,
            normalized.interventionRecord.awaitId,
          ),
        },
      };
    }
  }

  if (normalized.replayMarker) {
    nextMarkers.push(normalized.replayMarker);
  }

  const nextSnapshots = [
    ...state.snapshots,
    snapshotFromMatchState(
      `${envelope.envelopeId}:snapshot`,
      envelope.timestamp,
      nextMatchState,
    ),
  ];

  return {
    matchState: nextMatchState,
    awaitRecords: nextAwaitRecords,
    publicEvents: nextPublicEvents,
    interventions: nextInterventions,
    markers: nextMarkers,
    snapshots: nextSnapshots,
    replayBundle: createReplayBundle({
      runId: nextMatchState.runId,
      publicEvents: nextPublicEvents,
      snapshots: nextSnapshots,
      markers: nextMarkers,
    }),
  };
}

export function reduceAcpIngressEnvelopes(
  input: AcpIngressReducerInput,
): AcpIngressReducerState {
  const initialMatchState = seedStateToIngressStart(
    createInitialMatchState(input.manifest, input.roster),
    input.envelopes,
  );
  const initialSnapshots = [
    snapshotFromMatchState(
      'snapshot_ingress_start',
      defaultInitialTimestamp(input.envelopes),
      initialMatchState,
    ),
  ];

  const initialState: AcpIngressReducerState = {
    matchState: initialMatchState,
    awaitRecords: [],
    publicEvents: [],
    interventions: [],
    markers: [],
    snapshots: initialSnapshots,
    replayBundle: createReplayBundle({
      runId: input.manifest.runId,
      publicEvents: [],
      snapshots: initialSnapshots,
      markers: [],
    }),
  };

  return input.envelopes.reduce(
    (state, envelope) => applyEnvelopeToState(state, envelope),
    initialState,
  );
}
