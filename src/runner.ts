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
  BenchmarkSummary,
  CommitmentClaim,
  CommitmentDivergenceRecord,
  InterventionRecord,
  MatchState,
  PrivateArtifactRef,
  PublicEvent,
  ReplayMarker,
  ReplaySnapshot,
  RosterEntry,
  RunManifest,
  SpeechCommitmentLinkRecord,
  StructuredCommitment,
  StructuredCommitmentEnvelope,
  StructuredCommitmentPayload,
  TaskOutputRef,
} from './schema.js';

type TaskScoreMap = Record<string, number>;
type VoteMap = Record<string, string>;
type DmSpendMap = Record<string, number>;

export interface SimulatedUtterance {
  agentId: string;
  text: string;
  commitmentClaims?: readonly CommitmentClaim[];
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

function contextualizeAwaitRecord(
  awaitRecord: AwaitRecord,
  state: MatchState,
): AwaitRecord {
  return {
    ...awaitRecord,
    scope: {
      ...awaitRecord.scope,
      runId: state.runId,
      matchId: state.matchId,
      round: state.current.round,
      phase: state.current.phase,
    },
  };
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
  commitmentClaims: readonly CommitmentClaim[],
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
    commitmentClaims: [...commitmentClaims],
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

function flattenStructuredCommitments(envelopes: readonly StructuredCommitmentEnvelope[]): StructuredCommitment[] {
  return envelopes.flatMap((envelope) => envelope.commitments);
}

function countByType<T extends string>(values: readonly T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizePayload(payload: StructuredCommitmentPayload): Record<string, unknown> {
  switch (payload.commitmentType) {
    case 'ally_set':
      return {
        commitmentType: payload.commitmentType,
        allyAgentIds: [...payload.allyAgentIds].sort(),
        strength: payload.strength,
      };
    case 'task_plan':
      return {
        commitmentType: payload.commitmentType,
        summary: payload.summary,
        collaboratorAgentIds: [...payload.collaboratorAgentIds].sort(),
        riskLevel: payload.riskLevel,
      };
    case 'intended_vote':
      return {
        commitmentType: payload.commitmentType,
        targetAgentId: payload.targetAgentId,
        justification: payload.justification ?? null,
      };
    case 'betrayal_target':
      return {
        commitmentType: payload.commitmentType,
        targetAgentId: payload.targetAgentId,
        rationale: payload.rationale ?? null,
      };
    case 'freeze':
      return {
        commitmentType: payload.commitmentType,
        reason: payload.reason,
      };
    case 'nudge':
      return {
        commitmentType: payload.commitmentType,
        targetAgentId: payload.targetAgentId,
        prompt: payload.prompt,
      };
  }
}

function payloadsMatch(left: StructuredCommitmentPayload, right: StructuredCommitmentPayload): boolean {
  return JSON.stringify(normalizePayload(left)) === JSON.stringify(normalizePayload(right));
}

function buildSpeechCommitmentLinks(
  manifest: RunManifest,
  publicEvents: readonly PublicEvent[],
  privateArtifacts: readonly PrivateArtifactRef[],
  structuredCommitments: readonly StructuredCommitmentEnvelope[],
): SpeechCommitmentLinkRecord[] {
  const links: SpeechCommitmentLinkRecord[] = [];
  const commitmentById = new Map(flattenStructuredCommitments(structuredCommitments).map((commitment) => [commitment.commitmentId, commitment]));

  function pushLinks(
    source: {
      cursor: MatchState['current'];
      layer: 'public' | 'private';
      sourceRecordId: string;
      sourceKind: 'public_event' | 'private_artifact';
      actorAgentId: string | undefined;
      linkedCommitmentIds: readonly string[];
      commitmentClaims: readonly CommitmentClaim[];
    },
  ): void {
    for (const commitmentId of source.linkedCommitmentIds) {
      const commitment = commitmentById.get(commitmentId);
      if (!commitment) {
        continue;
      }

      const declaredClaim = source.commitmentClaims.find((claim) => claim.commitmentId === commitmentId);
      const evaluation = declaredClaim
        ? payloadsMatch(declaredClaim.payload, commitment.payload) ? 'aligned' : 'divergent'
        : 'unknown';
      const evidence = declaredClaim ? 'declared_payload' : 'linked_only';
      const sourceLabel = source.sourceKind === 'public_event' ? 'public speech' : 'private artifact';

      links.push({
        linkId: `link_${source.sourceRecordId}_${commitmentId}`,
        runId: manifest.runId,
        matchId: manifest.matchId,
        cursor: source.cursor,
        layer: source.layer,
        sourceRecordId: source.sourceRecordId,
        sourceKind: source.sourceKind,
        agentId: source.actorAgentId ?? commitment.agentId,
        commitmentId,
        commitmentType: commitment.payload.commitmentType,
        evaluation,
        evidence,
        summary: declaredClaim
          ? `${sourceLabel} ${source.sourceRecordId} ${evaluation === 'aligned' ? 'matches' : 'diverges from'} ${commitmentId}`
          : `${sourceLabel} ${source.sourceRecordId} links to ${commitmentId} without a declared payload`,
        ...(declaredClaim ? { declaredPayload: declaredClaim.payload } : {}),
      });
    }
  }

  for (const event of publicEvents) {
    pushLinks({
      cursor: event.cursor,
      layer: 'public',
      sourceRecordId: event.eventId,
      sourceKind: 'public_event',
      actorAgentId: event.actorAgentIds[0],
      linkedCommitmentIds: event.linkedCommitmentIds,
      commitmentClaims: event.commitmentClaims,
    });
  }

  for (const artifact of privateArtifacts) {
    pushLinks({
      cursor: artifact.cursor,
      layer: 'private',
      sourceRecordId: artifact.artifactId,
      sourceKind: 'private_artifact',
      actorAgentId: artifact.agentId,
      linkedCommitmentIds: artifact.linkedCommitmentIds,
      commitmentClaims: artifact.commitmentClaims,
    });
  }

  return links;
}

function buildCommitmentDivergences(
  manifest: RunManifest,
  publicEvents: readonly PublicEvent[],
  structuredCommitments: readonly StructuredCommitmentEnvelope[],
  speechLinks: readonly SpeechCommitmentLinkRecord[],
  revealedVotesByRound: ReadonlyMap<string, string>,
): CommitmentDivergenceRecord[] {
  const divergences: CommitmentDivergenceRecord[] = [];
  const commitmentById = new Map(flattenStructuredCommitments(structuredCommitments).map((commitment) => [commitment.commitmentId, commitment]));
  const voteRevealEvents = new Map(
    publicEvents
      .filter((event) => event.kind === 'vote_reveal')
      .map((event) => [event.cursor.round, event]),
  );

  for (const link of speechLinks) {
    if (link.evaluation === 'unknown') {
      continue;
    }

    if (!link.declaredPayload) {
      continue;
    }

    const commitment = commitmentById.get(link.commitmentId);
    if (!commitment) {
      continue;
    }

    divergences.push({
      divergenceId: `divergence_speech_${link.linkId}`,
      runId: manifest.runId,
      matchId: manifest.matchId,
      cursor: link.cursor,
      agentId: commitment.agentId,
      commitmentId: link.commitmentId,
      commitmentType: commitment.payload.commitmentType,
      comparison: 'speech_vs_commitment',
      outcome: link.evaluation,
      sourceRecordIds: [link.sourceRecordId, link.commitmentId],
      summary: `Speech evidence ${link.sourceRecordId} is ${link.evaluation} with commitment ${link.commitmentId}`,
      expectedPayload: commitment.payload,
      observedPayload: link.declaredPayload,
    });
  }

  for (const commitment of flattenStructuredCommitments(structuredCommitments)) {
    if (commitment.payload.commitmentType !== 'intended_vote') {
      continue;
    }

    const revealedTarget = revealedVotesByRound.get(`${commitment.round}:${commitment.agentId}`);
    if (!revealedTarget) {
      continue;
    }

    const revealEvent = voteRevealEvents.get(commitment.round);
    const observedPayload: StructuredCommitmentPayload = {
      commitmentType: 'intended_vote',
      targetAgentId: revealedTarget,
    };

    divergences.push({
      divergenceId: `divergence_reveal_${commitment.commitmentId}`,
      runId: manifest.runId,
      matchId: manifest.matchId,
      cursor: { round: commitment.round, phase: 'simultaneous_reveal' },
      agentId: commitment.agentId,
      commitmentId: commitment.commitmentId,
      commitmentType: commitment.payload.commitmentType,
      comparison: 'commitment_vs_reveal',
      outcome: payloadsMatch(commitment.payload, observedPayload) ? 'aligned' : 'divergent',
      sourceRecordIds: revealEvent ? [revealEvent.eventId, commitment.commitmentId] : [commitment.commitmentId],
      summary: `Revealed vote for ${commitment.agentId} ${payloadsMatch(commitment.payload, observedPayload) ? 'matches' : 'diverges from'} sealed commitment ${commitment.commitmentId}`,
      expectedPayload: commitment.payload,
      observedPayload,
    });
  }

  return divergences;
}

function buildReplayMarkers(
  manifest: RunManifest,
  publicEvents: readonly PublicEvent[],
  alerts: readonly AlertRecord[],
  interventions: readonly InterventionRecord[],
  divergences: readonly CommitmentDivergenceRecord[],
): ReplayMarker[] {
  const markers: ReplayMarker[] = [];

  for (const event of publicEvents) {
    if (event.kind === 'vote_reveal') {
      markers.push({
        markerId: `marker_${event.eventId}`,
        runId: manifest.runId,
        cursor: event.cursor,
        markerType: 'reveal',
        label: `Round ${event.cursor.round} votes revealed`,
        sourceEventIds: [event.eventId],
      });
      continue;
    }

    if (event.kind === 'commitment_reveal') {
      markers.push({
        markerId: `marker_${event.eventId}`,
        runId: manifest.runId,
        cursor: event.cursor,
        markerType: 'reveal',
        label: `Round ${event.cursor.round} commitments revealed`,
        sourceEventIds: [event.eventId],
      });
      continue;
    }

    if (event.kind === 'elimination') {
      markers.push({
        markerId: `marker_${event.eventId}`,
        runId: manifest.runId,
        cursor: event.cursor,
        markerType: 'elimination',
        label: `Round ${event.cursor.round} elimination: ${event.actorAgentIds.join(', ')}`,
        sourceEventIds: [event.eventId],
      });
      continue;
    }

    if (event.kind === 'score_delta') {
      markers.push({
        markerId: `marker_${event.eventId}`,
        runId: manifest.runId,
        cursor: event.cursor,
        markerType: 'bookmark',
        label: `Round ${event.cursor.round} scores posted`,
        sourceEventIds: [event.eventId],
      });
    }
  }

  for (const alert of alerts) {
    markers.push({
      markerId: `marker_${alert.alertId}`,
      runId: manifest.runId,
      cursor: alert.cursor,
      markerType: 'alert',
      label: alert.message,
      sourceEventIds: [...alert.sourceRecordIds],
    });
  }

  for (const intervention of interventions) {
    markers.push({
      markerId: `marker_${intervention.interventionId}_open`,
      runId: manifest.runId,
      cursor: intervention.cursor,
      markerType: 'await_open',
      label: `Await opened: ${intervention.kind}`,
      sourceEventIds: [intervention.interventionId],
      linkedAwaitId: intervention.awaitId,
    });

    if (intervention.status !== 'pending') {
      markers.push({
        markerId: `marker_${intervention.interventionId}_resolved`,
        runId: manifest.runId,
        cursor: intervention.cursor,
        markerType: 'await_resolved',
        label: `Await resolved: ${intervention.kind}`,
        sourceEventIds: [intervention.interventionId],
        linkedAwaitId: intervention.awaitId,
      });
    }
  }

  for (const divergence of divergences) {
    if (divergence.outcome !== 'divergent') {
      continue;
    }

    markers.push({
      markerId: `marker_${divergence.divergenceId}`,
      runId: manifest.runId,
      cursor: divergence.cursor,
      markerType: 'betrayal',
      label: divergence.summary,
      sourceEventIds: [...divergence.sourceRecordIds],
    });
  }

  return markers;
}

function buildBenchmarkSummary(
  manifest: RunManifest,
  finalState: MatchState,
  finalOutcome: FinalOutcomeResult,
  publicEvents: readonly PublicEvent[],
  privateArtifacts: readonly PrivateArtifactRef[],
  structuredCommitments: readonly StructuredCommitmentEnvelope[],
  speechCommitmentLinks: readonly SpeechCommitmentLinkRecord[],
  commitmentDivergences: readonly CommitmentDivergenceRecord[],
  replayMarkers: readonly ReplayMarker[],
  alerts: readonly AlertRecord[],
  interventions: readonly InterventionRecord[],
): BenchmarkSummary {
  return {
    runId: manifest.runId,
    matchId: manifest.matchId,
    condition: manifest.condition,
    runSeed: manifest.runSeed,
    validityStatus: manifest.validityStatus,
    roundsPlayed: finalState.current.round,
    winnerIds: [...finalOutcome.winnerIds],
    eliminatedAgentIds: [...finalState.eliminatedAgentIds],
    totals: {
      publicEvents: publicEvents.length,
      privateArtifacts: privateArtifacts.length,
      structuredCommitments: flattenStructuredCommitments(structuredCommitments).length,
      speechCommitmentLinks: speechCommitmentLinks.length,
      commitmentDivergences: commitmentDivergences.length,
      replayMarkers: replayMarkers.length,
      alerts: alerts.length,
      interventions: interventions.length,
    },
    replayMarkersByType: countByType(replayMarkers.map((marker) => marker.markerType)),
    divergenceByOutcome: countByType(commitmentDivergences.map((record) => record.outcome)),
    highlightLabels: replayMarkers.slice(0, 8).map((marker) => marker.label),
  };
}

export function runDeterministicMatch(input: DeterministicRunnerInput): DeterministicRunnerResult {
  let state = createInitialMatchState(input.manifest, input.roster);
  const publicEvents: PublicEvent[] = [];
  const interventions: InterventionRecord[] = [];
  const snapshots: ReplaySnapshot[] = [];
  const privateArtifacts: ArtifactBundle['privateArtifacts'] = [];
  const alerts: AlertRecord[] = [];
  const taskOutputs: TaskOutputRef[] = [];
  const revealedVotesByRound = new Map<string, string>();
  const roundDeltasByAgent: Record<string, number[]> = Object.fromEntries(
    input.roster.map((entry) => [entry.agentId, []]),
  );

  for (const [index, roundInput] of input.rounds.entries()) {
    const round = index + 1;
    if (state.current.round !== round || state.current.phase !== 'cast_intro') {
      throw new Error(`runner expected round ${round} cast_intro, got round ${state.current.round} ${state.current.phase}`);
    }

    publicEvents.push(
      buildPublicEvent(state.runId, state.matchId, round, state.current.phase, 'round_open', [], [], [], {
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
          utterance.commitmentClaims?.map((claim) => claim.commitmentId) ?? [],
          utterance.commitmentClaims ?? [],
          { text: utterance.text },
          utteranceIndex,
        ),
      );
    }

    state = advanceMatchState(state); // task_submission
    if (roundInput.awaitingDefaults?.length) {
      const contextualAwaitRecords = roundInput.awaitingDefaults.map((awaitRecord) =>
        contextualizeAwaitRecord(awaitRecord, state),
      );
      state = {
        ...state,
        status: 'paused',
        openAwaitIds: contextualAwaitRecords.map((awaitRecord) => awaitRecord.awaitId),
        layers: {
          ...state.layers,
          interventionQueueIds: contextualAwaitRecords.map((awaitRecord) => awaitRecord.awaitId),
        },
      };

      for (const awaitRecord of contextualAwaitRecords) {
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
      for (const [agentId, targetAgentId] of Object.entries(roundInput.revealedVotes)) {
        revealedVotesByRound.set(`${round}:${agentId}`, targetAgentId);
      }

      publicEvents.push(
        buildPublicEvent(
          state.runId,
          state.matchId,
          round,
          state.current.phase,
          'vote_reveal',
          Object.keys(roundInput.revealedVotes),
          [],
          [],
          {
            votes: roundInput.revealedVotes,
          },
        ),
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
          [],
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
      buildPublicEvent(state.runId, state.matchId, round, state.current.phase, 'score_delta', [], [], [], {
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

  const speechCommitmentLinks = buildSpeechCommitmentLinks(
    input.manifest,
    publicEvents,
    privateArtifacts,
    finalState.structuredCommitments,
  );
  const commitmentDivergences = buildCommitmentDivergences(
    input.manifest,
    publicEvents,
    finalState.structuredCommitments,
    speechCommitmentLinks,
    revealedVotesByRound,
  );
  const replayMarkers = buildReplayMarkers(
    input.manifest,
    publicEvents,
    alerts,
    interventions,
    commitmentDivergences,
  );
  const benchmarkSummary = buildBenchmarkSummary(
    input.manifest,
    finalState,
    finalOutcome,
    publicEvents,
    privateArtifacts,
    finalState.structuredCommitments,
    speechCommitmentLinks,
    commitmentDivergences,
    replayMarkers,
    alerts,
    interventions,
  );

  const artifactBundle = createArtifactBundle({
    manifest: input.manifest,
    benchmarkSummary,
    roster: input.roster,
    publicEvents,
    structuredCommitments: state.structuredCommitments,
    privateArtifacts,
    speechCommitmentLinks,
    commitmentDivergences,
    alerts,
    interventions,
    taskOutputs,
    finalScores: finalOutcome.finalScores,
    snapshots,
    markers: replayMarkers,
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
