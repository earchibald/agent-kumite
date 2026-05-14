import {
  addStructuredCommitmentEnvelopes,
  advanceMatchState,
  applyScoreDeltas,
  computeFinalOutcome,
  computeRoundScoreDeltas,
  createArtifactBundle,
  createInitialMatchState,
  determineElimination,
  revealStructuredCommitments,
  resolveAwaitByDefault,
  snapshotFromMatchState,
  spendDmBudget,
  type FinalOutcomeResult,
} from './engine.js';
import type {
  AlertRecord,
  ArtifactBundle,
  AwaitRecord,
  InterventionRecord,
  MatchState,
  PublicEvent,
  ReplaySnapshot,
  RosterEntry,
  RunManifest,
  StructuredCommitmentEnvelope,
  TaskOutputRef,
} from './schema.js';

type TaskScoreMap = Record<string, number>;
type VoteMap = Record<string, string>;
type DmSpendMap = Record<string, number>;

export interface SimulatedUtterance {
  agentId: string;
  text: string;
}

export interface SimulatedRoundInput {
  publicUtterances?: readonly SimulatedUtterance[];
  dmSpends?: DmSpendMap;
  structuredCommitments?: readonly StructuredCommitmentEnvelope[];
  intendedVotes?: VoteMap;
  revealedVotes?: VoteMap;
  taskScores: TaskScoreMap;
  saboteurBonusAgentIds?: readonly string[];
  awaitingDefaults?: readonly AwaitRecord[];
  privateArtifacts?: ArtifactBundle['privateArtifacts'];
  alerts?: readonly AlertRecord[];
  taskOutputs?: readonly TaskOutputRef[];
}

export interface DeterministicRunnerInput {
  manifest: RunManifest;
  roster: readonly RosterEntry[];
  rounds: readonly SimulatedRoundInput[];
}

export interface DeterministicRunnerResult {
  finalState: MatchState;
  publicEvents: PublicEvent[];
  interventions: InterventionRecord[];
  snapshots: ReplaySnapshot[];
  artifactBundle: ArtifactBundle;
  finalOutcome: FinalOutcomeResult;
}

function isoTimestamp(round: number, phaseIndex: number, offset = 0): string {
  const totalMinutes = (round - 1) * 10 + phaseIndex;
  const minutes = String(Math.floor((totalMinutes + offset) % 60)).padStart(2, '0');
  const hours = String(Math.floor((totalMinutes + offset) / 60)).padStart(2, '0');
  return `2026-05-14T${hours}:${minutes}:00Z`;
}

function eventId(round: number, phase: string, kind: string, index = 0): string {
  return `evt_r${round}_${phase}_${kind}_${index + 1}`;
}

function buildPublicEvent(
  runId: string,
  matchId: string,
  round: number,
  phase: MatchState['current']['phase'],
  kind: PublicEvent['kind'],
  actorAgentIds: readonly string[],
  linkedCommitmentIds: readonly string[],
  payload: Record<string, unknown>,
  index = 0,
): PublicEvent {
  return {
    eventId: eventId(round, phase, kind, index),
    runId,
    matchId,
    cursor: { round, phase },
    timestamp: isoTimestamp(round, phaseOrderIndex(phase), index),
    kind,
    layer: 'public',
    actorAgentIds: [...actorAgentIds],
    linkedCommitmentIds: [...linkedCommitmentIds],
    payload,
  };
}

function phaseOrderIndex(phase: MatchState['current']['phase']): number {
  const order: MatchState['current']['phase'][] = [
    'cast_intro',
    'private_negotiation',
    'structured_commitment_submission',
    'public_square',
    'task_submission',
    'simultaneous_reveal',
    'resolution_pressure_escalation',
    'elimination_aftermath',
    'task_scoring_debrief',
  ];
  const index = order.indexOf(phase);
  if (index === -1) {
    throw new Error(`unknown phase ${phase}`);
  }
  return index;
}

function defaultTaskOutputs(
  runId: string,
  round: number,
  taskScores: TaskScoreMap,
): TaskOutputRef[] {
  return Object.entries(taskScores).map(([agentId, finalScore]) => ({
    submissionId: `task_output_r${round}_${agentId}`,
    runId,
    agentId,
    round,
    rubricId: `rubric_r${round}`,
    finalScore,
  }));
}

function removeAgent(list: readonly string[], agentId: string): string[] {
  return list.filter((current) => current !== agentId);
}

export function runDeterministicMatch(input: DeterministicRunnerInput): DeterministicRunnerResult {
  let state = createInitialMatchState(input.manifest, input.roster);
  const publicEvents: PublicEvent[] = [];
  const interventions: InterventionRecord[] = [];
  const snapshots: ReplaySnapshot[] = [];
  const privateArtifacts: ArtifactBundle['privateArtifacts'] = [];
  const alerts: AlertRecord[] = [];
  const taskOutputs: TaskOutputRef[] = [];
  const roundDeltasByAgent: Record<string, number[]> = Object.fromEntries(
    input.roster.map((entry) => [entry.agentId, []]),
  );

  for (const [index, roundInput] of input.rounds.entries()) {
    const round = index + 1;
    if (state.current.round !== round || state.current.phase !== 'cast_intro') {
      throw new Error(`runner expected round ${round} cast_intro, got round ${state.current.round} ${state.current.phase}`);
    }

    publicEvents.push(
      buildPublicEvent(state.runId, state.matchId, round, state.current.phase, 'round_open', [], [], {
        aliveAgentIds: state.aliveAgentIds,
      }),
    );

    state = advanceMatchState(state); // private_negotiation
    for (const [agentId, amount] of Object.entries(roundInput.dmSpends ?? {})) {
      state = spendDmBudget(state, agentId, amount);
    }

    state = advanceMatchState(state); // structured_commitment_submission
    state = addStructuredCommitmentEnvelopes(state, roundInput.structuredCommitments ?? []);

    state = advanceMatchState(state); // public_square
    for (const [utteranceIndex, utterance] of (roundInput.publicUtterances ?? []).entries()) {
      publicEvents.push(
        buildPublicEvent(
          state.runId,
          state.matchId,
          round,
          state.current.phase,
          'public_utterance',
          [utterance.agentId],
          [],
          { text: utterance.text },
          utteranceIndex,
        ),
      );
    }

    state = advanceMatchState(state); // task_submission
    if (roundInput.awaitingDefaults?.length) {
      state = {
        ...state,
        status: 'paused',
        openAwaitIds: roundInput.awaitingDefaults.map((awaitRecord) => awaitRecord.awaitId),
        layers: {
          ...state.layers,
          interventionQueueIds: roundInput.awaitingDefaults.map((awaitRecord) => awaitRecord.awaitId),
        },
      };

      for (const awaitRecord of roundInput.awaitingDefaults) {
        const resolution = resolveAwaitByDefault(awaitRecord, input.manifest.condition, isoTimestamp(round, phaseOrderIndex(state.current.phase), 1));
        interventions.push(resolution.interventionRecord);
      }

      state = {
        ...state,
        status: 'live',
        openAwaitIds: [],
        layers: {
          ...state.layers,
          interventionQueueIds: [],
        },
      };
    }

    state = advanceMatchState(state); // simultaneous_reveal
    const commitmentReveal = revealStructuredCommitments(state, isoTimestamp(round, phaseOrderIndex(state.current.phase), 2));
    state = commitmentReveal.state;
    if (roundInput.revealedVotes && Object.keys(roundInput.revealedVotes).length > 0) {
      publicEvents.push(
        buildPublicEvent(state.runId, state.matchId, round, state.current.phase, 'vote_reveal', Object.keys(roundInput.revealedVotes), [], {
          votes: roundInput.revealedVotes,
        }),
      );
    }
    if ((roundInput.structuredCommitments?.length ?? 0) > 0) {
      publicEvents.push(
        buildPublicEvent(
          state.runId,
          state.matchId,
          round,
          state.current.phase,
          'commitment_reveal',
          commitmentReveal.revealedCommitments.map((envelope) => envelope.agentId),
          commitmentReveal.revealedCommitments.flatMap((envelope) =>
            envelope.commitments.map((commitment) => commitment.commitmentId),
          ),
          {
            count: commitmentReveal.revealedCommitments.reduce(
              (count, envelope) => count + envelope.commitments.length,
              0,
            ),
            envelopeIds: commitmentReveal.revealedCommitments.map((envelope) => envelope.envelopeId),
          },
        ),
      );
    }

    const elimination = determineElimination(round, roundInput.revealedVotes ?? {});

    state = advanceMatchState(state); // resolution_pressure_escalation
    if (elimination.eliminatedAgentId) {
      state = {
        ...state,
        aliveAgentIds: removeAgent(state.aliveAgentIds, elimination.eliminatedAgentId),
        eliminatedAgentIds: [...state.eliminatedAgentIds, elimination.eliminatedAgentId],
        dmBudgetByAgent: Object.fromEntries(
          Object.entries(state.dmBudgetByAgent).filter(([agentId]) => agentId !== elimination.eliminatedAgentId),
        ),
      };
    }

    state = advanceMatchState(state); // elimination_aftermath
    if (elimination.eliminatedAgentId) {
      publicEvents.push(
        buildPublicEvent(
          state.runId,
          state.matchId,
          round,
          state.current.phase,
          'elimination',
          [elimination.eliminatedAgentId],
          [],
          { voteCounts: elimination.voteCounts },
        ),
      );
    }

    state = advanceMatchState(state); // task_scoring_debrief
    const scoreInput = {
      round,
      roster: input.roster,
      aliveAgentIds: state.aliveAgentIds,
      taskScores: roundInput.taskScores,
      eliminatedAgentId: elimination.eliminatedAgentId,
    } as {
      round: number;
      roster: readonly RosterEntry[];
      aliveAgentIds: readonly string[];
      taskScores: TaskScoreMap;
      eliminatedAgentId: string | null;
      intendedVotes?: VoteMap;
      saboteurBonusAgentIds?: readonly string[];
    };

    if (roundInput.intendedVotes) {
      scoreInput.intendedVotes = roundInput.intendedVotes;
    }

    if (roundInput.saboteurBonusAgentIds) {
      scoreInput.saboteurBonusAgentIds = roundInput.saboteurBonusAgentIds;
    }

    const deltas = computeRoundScoreDeltas(scoreInput);

    for (const [agentId, delta] of Object.entries(deltas)) {
      roundDeltasByAgent[agentId] ??= [];
      roundDeltasByAgent[agentId].push(delta);
    }

    state = {
      ...state,
      scoreByAgent: applyScoreDeltas(state.scoreByAgent, deltas),
    };
    publicEvents.push(
      buildPublicEvent(state.runId, state.matchId, round, state.current.phase, 'score_delta', [], [], {
        deltas,
      }),
    );

    privateArtifacts.push(...(roundInput.privateArtifacts ?? []));
    alerts.push(...(roundInput.alerts ?? []));
    taskOutputs.push(...(roundInput.taskOutputs ?? defaultTaskOutputs(state.runId, round, roundInput.taskScores)));

    snapshots.push(snapshotFromMatchState(`snapshot_r${round}_close`, isoTimestamp(round, phaseOrderIndex(state.current.phase)), state));

    const shouldComplete = round === input.rounds.length || state.aliveAgentIds.length === 1 || round === 5;
    if (!shouldComplete) {
      state = advanceMatchState(state);
    }
  }

  const finalOutcome = computeFinalOutcome({
    roster: input.roster,
    scoreTotals: state.scoreByAgent,
    aliveAgentIds: state.aliveAgentIds,
    roundDeltasByAgent,
  });

  const finalState: MatchState = {
    ...state,
    status: 'completed',
  };

  const artifactBundle = createArtifactBundle({
    manifest: input.manifest,
    roster: input.roster,
    publicEvents,
    structuredCommitments: state.structuredCommitments,
    privateArtifacts,
    alerts,
    interventions,
    taskOutputs,
    finalScores: finalOutcome.finalScores,
    snapshots,
    markers: [],
  });

  return {
    finalState,
    publicEvents,
    interventions,
    snapshots,
    artifactBundle,
    finalOutcome,
  };
}
