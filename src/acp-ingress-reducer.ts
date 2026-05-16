import {
  addStructuredCommitmentEnvelopes,
  applyScoreDeltas,
  createInitialMatchState,
  createReplayBundle,
  dmBudgetForRound,
  revealStructuredCommitments,
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

export interface AcpIngressReducerSeedInput {
  manifest: RunManifest;
  roster: readonly RosterEntry[];
  initialTimestamp?: string;
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

function hasAppliedIngress(state: AcpIngressReducerState): boolean {
  return state.publicEvents.length > 0
    || state.awaitRecords.length > 0
    || state.interventions.length > 0
    || state.markers.length > 0
    || state.snapshots.length > 1;
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

function scoreDeltasFromPublicEvent(event: PublicEvent): Record<string, number> {
  const deltas = event.payload.deltas;
  if (!deltas || typeof deltas !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(deltas).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
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

  if (normalized.structuredCommitmentEnvelope) {
    nextMatchState = addStructuredCommitmentEnvelopes(nextMatchState, [normalized.structuredCommitmentEnvelope]);
  }

  if (normalized.publicEvent) {
    nextPublicEvents.push(normalized.publicEvent);
    if (normalized.publicEvent.kind === 'commitment_reveal') {
      nextMatchState = revealStructuredCommitments(nextMatchState, normalized.publicEvent.timestamp).state;
    } else if (normalized.publicEvent.kind === 'score_delta') {
      nextMatchState = {
        ...nextMatchState,
        scoreByAgent: applyScoreDeltas(
          nextMatchState.scoreByAgent,
          scoreDeltasFromPublicEvent(normalized.publicEvent),
        ),
      };
    } else if (normalized.publicEvent.kind === 'elimination') {
      const [eliminatedAgentId] = normalized.publicEvent.actorAgentIds;
      if (eliminatedAgentId) {
        nextMatchState = {
          ...nextMatchState,
          aliveAgentIds: removeId(nextMatchState.aliveAgentIds, eliminatedAgentId),
          eliminatedAgentIds: appendUniqueId(nextMatchState.eliminatedAgentIds, eliminatedAgentId),
          dmBudgetByAgent: Object.fromEntries(
            Object.entries(nextMatchState.dmBudgetByAgent).filter(([agentId]) => agentId !== eliminatedAgentId),
          ),
        };
      }
    }
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

function seedReducerStateToFirstEnvelope(
  state: AcpIngressReducerState,
  envelope: AcpIngressEnvelope,
): AcpIngressReducerState {
  if (hasAppliedIngress(state)) {
    return state;
  }

  const seededMatchState = seedStateToIngressStart(state.matchState, [envelope]);
  const seededSnapshot = snapshotFromMatchState(
    'snapshot_ingress_start',
    envelope.timestamp,
    seededMatchState,
  );

  return {
    ...state,
    matchState: seededMatchState,
    snapshots: [seededSnapshot],
    replayBundle: createReplayBundle({
      runId: seededMatchState.runId,
      publicEvents: [],
      snapshots: [seededSnapshot],
      markers: [],
    }),
  };
}

export function createAcpIngressReducerState(
  input: AcpIngressReducerSeedInput,
): AcpIngressReducerState {
  const initialMatchState = createInitialMatchState(input.manifest, input.roster);
  const initialSnapshots = [
    snapshotFromMatchState(
      'snapshot_ingress_start',
      input.initialTimestamp ?? defaultInitialTimestamp([]),
      initialMatchState,
    ),
  ];

  return {
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
}

export function appendAcpIngressEnvelope(
  state: AcpIngressReducerState,
  envelope: AcpIngressEnvelope,
): AcpIngressReducerState {
  return applyEnvelopeToState(seedReducerStateToFirstEnvelope(state, envelope), envelope);
}

export function appendAcpIngressEnvelopes(
  state: AcpIngressReducerState,
  envelopes: readonly AcpIngressEnvelope[],
): AcpIngressReducerState {
  return envelopes.reduce(
    (nextState, envelope) => appendAcpIngressEnvelope(nextState, envelope),
    state,
  );
}

export function reduceAcpIngressEnvelopes(
  input: AcpIngressReducerInput,
): AcpIngressReducerState {
  return appendAcpIngressEnvelopes(
    createAcpIngressReducerState({
      manifest: input.manifest,
      roster: input.roster,
      initialTimestamp: defaultInitialTimestamp(input.envelopes),
    }),
    input.envelopes,
  );
}
