import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import {
  FinalScoreRowSchema,
  InterventionRecordSchema,
  ROUND_PHASE_ORDER,
  ReplaySnapshotSchema,
  RosterEntrySchema,
  type AlertRecord,
  type ArtifactBundle,
  type AwaitRecord,
  type CommitmentRef,
  type Condition,
  type FinalScoreRow,
  type InterventionRecord,
  type MatchState,
  type MatchStatus,
  type PhaseCursor,
  type PublicEvent,
  type ReplayBundle,
  type ReplayMarker,
  type ReplaySnapshot,
  type RosterEntry,
  type RoundPhase,
  type RunManifest,
  type TaskOutputRef,
} from './schema.js';
import {
  validateArtifactBundle,
  validateAwaitRecord,
  validateMatchState,
  validateReplayBundle,
  validateRunManifest,
} from './validate.js';

const MAX_ROUNDS = 5;
const DM_BUDGET_BY_ROUND = [5, 4, 3, 2, 1] as const;
const phaseIndex = new Map<RoundPhase, number>(ROUND_PHASE_ORDER.map((phase, index) => [phase, index]));

type ScoreMap = Record<string, number>;
type VoteMap = Record<string, string>;

export interface EliminationResult {
  eliminatedAgentId: string | null;
  voteCounts: Record<string, number>;
  isTie: boolean;
}

export interface RoundScoreInput {
  round: number;
  roster: readonly RosterEntry[];
  aliveAgentIds: readonly string[];
  taskScores: Record<string, number>;
  intendedVotes?: VoteMap;
  eliminatedAgentId?: string | null;
  saboteurBonusAgentIds?: readonly string[];
}

export interface FinalOutcomeInput {
  roster: readonly RosterEntry[];
  scoreTotals: ScoreMap;
  aliveAgentIds: readonly string[];
  roundDeltasByAgent?: Record<string, number[]>;
}

export interface FinalOutcomeResult {
  winnerIds: string[];
  finalScores: FinalScoreRow[];
}

export interface ReplayBundleInput {
  runId: string;
  publicEvents: readonly PublicEvent[];
  snapshots?: readonly ReplaySnapshot[];
  markers?: readonly ReplayMarker[];
}

export interface ArtifactBundleInput {
  manifest: RunManifest;
  roster: readonly RosterEntry[];
  publicEvents: readonly PublicEvent[];
  structuredCommitments?: readonly CommitmentRef[];
  privateArtifacts?: ArtifactBundle['privateArtifacts'];
  alerts?: readonly AlertRecord[];
  interventions?: readonly InterventionRecord[];
  taskOutputs?: readonly TaskOutputRef[];
  finalScores?: readonly FinalScoreRow[];
  snapshots?: readonly ReplaySnapshot[];
  markers?: readonly ReplayMarker[];
}

export interface AwaitDefaultResolution {
  awaitRecord: AwaitRecord;
  interventionRecord: InterventionRecord;
}

function cloneScoreMap(input: ScoreMap): ScoreMap {
  return Object.fromEntries(Object.entries(input).map(([agentId, score]) => [agentId, score]));
}

function assertValid<T>(errors: string[], message: string): void {
  if (errors.length > 0) {
    throw new Error(`${message}: ${errors.join('; ')}`);
  }
}

function buildEmptyScores(roster: readonly RosterEntry[]): ScoreMap {
  return Object.fromEntries(roster.map((entry) => [entry.agentId, 0]));
}

function uniqueSortedCursors(cursors: readonly PhaseCursor[]): PhaseCursor[] {
  const keyed = new Map<string, PhaseCursor>();
  for (const cursor of cursors) {
    keyed.set(`${cursor.round}:${cursor.phase}`, cursor);
  }

  return [...keyed.values()].sort((left, right) => {
    if (left.round !== right.round) {
      return left.round - right.round;
    }

    return (phaseIndex.get(left.phase) ?? -1) - (phaseIndex.get(right.phase) ?? -1);
  });
}

export function dmBudgetForRound(round: number): number {
  if (!Number.isInteger(round) || round < 1 || round > MAX_ROUNDS) {
    throw new Error(`round must be an integer between 1 and ${MAX_ROUNDS}`);
  }

  return DM_BUDGET_BY_ROUND[round - 1]!;
}

export function createInitialMatchState(manifest: RunManifest, roster: readonly RosterEntry[]): MatchState {
  assertValid(validateRunManifest(manifest), 'manifest is invalid');
  assertValid(
    validateRoster(roster),
    'roster is invalid',
  );

  const initialBudget = dmBudgetForRound(1);
  const aliveAgentIds = roster.map((entry) => entry.agentId);
  const state: MatchState = {
    runId: manifest.runId,
    matchId: manifest.matchId,
    condition: manifest.condition,
    status: 'live',
    current: { round: 1, phase: 'cast_intro' },
    aliveAgentIds,
    eliminatedAgentIds: [],
    dmBudgetByAgent: Object.fromEntries(aliveAgentIds.map((agentId) => [agentId, initialBudget])),
    scoreByAgent: buildEmptyScores(roster),
    openAwaitIds: [],
    layers: {
      publicEventIds: [],
      privateArtifactIds: [],
      alertIds: [],
      interventionQueueIds: [],
    },
    commitmentRefs: [],
  };

  assertValid(validateMatchState(state), 'initial match state is invalid');
  return state;
}

export function advanceCursor(cursor: PhaseCursor): PhaseCursor {
  const currentIndex = phaseIndex.get(cursor.phase);
  if (currentIndex === undefined) {
    throw new Error(`unknown phase: ${cursor.phase}`);
  }

  if (currentIndex < ROUND_PHASE_ORDER.length - 1) {
    const nextPhase = ROUND_PHASE_ORDER[currentIndex + 1];
    if (!nextPhase) {
      throw new Error(`missing next phase after ${cursor.phase}`);
    }

    return {
      round: cursor.round,
      phase: nextPhase,
    };
  }

  if (cursor.round >= MAX_ROUNDS) {
    throw new Error(`cannot advance beyond round ${MAX_ROUNDS} ${cursor.phase}`);
  }

  return {
    round: cursor.round + 1,
    phase: 'cast_intro',
  };
}

export function advanceMatchState(state: MatchState, nextStatus: MatchStatus = 'live'): MatchState {
  assertValid(validateMatchState(state), 'match state is invalid');

  if (state.status === 'completed') {
    throw new Error('cannot advance a completed match');
  }

  const nextCursor = advanceCursor(state.current);
  const nextBudget = nextCursor.round === state.current.round ? state.dmBudgetByAgent : Object.fromEntries(
    state.aliveAgentIds.map((agentId) => [agentId, dmBudgetForRound(nextCursor.round)]),
  );

  const nextState: MatchState = {
    ...state,
    status: nextStatus,
    current: nextCursor,
    dmBudgetByAgent: nextBudget,
  };

  assertValid(validateMatchState(nextState), 'advanced match state is invalid');
  return nextState;
}

export function spendDmBudget(state: MatchState, agentId: string, amount = 1): MatchState {
  if (amount < 1) {
    throw new Error('DM spend amount must be at least 1');
  }

  if (!state.aliveAgentIds.includes(agentId)) {
    throw new Error(`agent ${agentId} is not alive in this match state`);
  }

  const currentBudget = state.dmBudgetByAgent[agentId];
  if (currentBudget === undefined) {
    throw new Error(`agent ${agentId} has no DM budget entry`);
  }

  if (currentBudget < amount) {
    throw new Error(`agent ${agentId} cannot spend ${amount} DM budget from ${currentBudget}`);
  }

  const nextState: MatchState = {
    ...state,
    dmBudgetByAgent: {
      ...state.dmBudgetByAgent,
      [agentId]: currentBudget - amount,
    },
  };

  assertValid(validateMatchState(nextState), 'state after DM spend is invalid');
  return nextState;
}

export function determineElimination(round: number, votes: VoteMap): EliminationResult {
  if (round < 3) {
    return { eliminatedAgentId: null, voteCounts: {}, isTie: false };
  }

  const counts: Record<string, number> = {};
  for (const target of Object.values(votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }

  let highestTarget: string | null = null;
  let highestCount = 0;
  let isTie = false;

  for (const [target, count] of Object.entries(counts)) {
    if (count > highestCount) {
      highestTarget = target;
      highestCount = count;
      isTie = false;
    } else if (count === highestCount) {
      isTie = true;
    }
  }

  return {
    eliminatedAgentId: highestCount === 0 || isTie ? null : highestTarget,
    voteCounts: counts,
    isTie,
  };
}

export function computeRoundScoreDeltas(input: RoundScoreInput): ScoreMap {
  const rosterById = new Map(input.roster.map((entry) => [entry.agentId, entry]));
  const aliveIds = new Set(input.aliveAgentIds);
  const saboteurBonusIds = new Set(input.saboteurBonusAgentIds ?? []);
  const deltas: ScoreMap = {};

  for (const entry of input.roster) {
    if (!aliveIds.has(entry.agentId)) {
      deltas[entry.agentId] = 0;
      continue;
    }

    let delta = input.taskScores[entry.agentId] ?? 0;
    if (entry.role !== 'analyst') {
      delta += 1;
    }

    if (input.round >= 3 && input.eliminatedAgentId && input.intendedVotes?.[entry.agentId] === input.eliminatedAgentId) {
      delta += 1;
    }

    if (entry.role === 'saboteur' && saboteurBonusIds.has(entry.agentId)) {
      delta += 3;
    }

    deltas[entry.agentId] = delta;
  }

  for (const agentId of Object.keys(input.taskScores)) {
    if (!rosterById.has(agentId)) {
      throw new Error(`unknown agent in task scores: ${agentId}`);
    }
  }

  return deltas;
}

export function applyScoreDeltas(scoreTotals: ScoreMap, deltas: ScoreMap): ScoreMap {
  const next = cloneScoreMap(scoreTotals);
  for (const [agentId, delta] of Object.entries(deltas)) {
    next[agentId] = (next[agentId] ?? 0) + delta;
  }

  return next;
}

export function computeFinalOutcome(input: FinalOutcomeInput): FinalOutcomeResult {
  const aliveIds = new Set(input.aliveAgentIds);
  const withBonuses = cloneScoreMap(input.scoreTotals);

  for (const agentId of input.aliveAgentIds) {
    withBonuses[agentId] = (withBonuses[agentId] ?? 0) + 5;
  }

  if (input.aliveAgentIds.length === 1) {
    const soleSurvivor = input.aliveAgentIds[0];
    if (soleSurvivor) {
      withBonuses[soleSurvivor] = (withBonuses[soleSurvivor] ?? 0) + 10;
    }
  }

  const eligibleAliveScores = input.aliveAgentIds.map((agentId) => ({ agentId, total: withBonuses[agentId] ?? 0 }));
  const highestTotal = eligibleAliveScores.reduce((max, item) => Math.max(max, item.total), Number.NEGATIVE_INFINITY);
  const winnerIds = eligibleAliveScores.filter((item) => item.total === highestTotal).map((item) => item.agentId);
  const winnerShare = winnerIds.length > 0 ? 1 / winnerIds.length : 0;

  const finalScores = input.roster.map<FinalScoreRow>((entry) => ({
    agentId: entry.agentId,
    roundDeltas: input.roundDeltasByAgent?.[entry.agentId] ?? [input.scoreTotals[entry.agentId] ?? 0],
    total: withBonuses[entry.agentId] ?? 0,
    winnerShare: winnerIds.includes(entry.agentId) && aliveIds.has(entry.agentId) ? winnerShare : 0,
  }));

  assertValid(
    finalScores.flatMap((row) => validateFinalScoreRow(row)),
    'final score rows are invalid',
  );

  return { winnerIds, finalScores };
}

export function resolveAwaitByDefault(
  awaitRecord: AwaitRecord,
  condition: Condition,
  resolvedAt: string,
  operatorId = 'runtime-default',
): AwaitDefaultResolution {
  assertValid(validateAwaitRecord(awaitRecord), 'await record is invalid');

  if (!awaitRecord.defaultChoice) {
    throw new Error(`await record ${awaitRecord.awaitId} has no default choice`);
  }

  if (condition !== 'C5' && awaitRecord.status !== 'pending') {
    throw new Error(`observation-only default resolution expects a pending await record, got ${awaitRecord.status}`);
  }

  const resolvedAwait: AwaitRecord = {
    ...awaitRecord,
    status: 'resolved',
  };
  const interventionRecord: InterventionRecord = {
    interventionId: `${awaitRecord.awaitId}:default`,
    runId: awaitRecord.scope.runId,
    cursor: {
      round: awaitRecord.scope.round,
      phase: awaitRecord.scope.phase,
    },
    layer: 'intervention',
    awaitId: awaitRecord.awaitId,
    kind: awaitRecord.kind,
    status: 'resolved',
    choiceId: awaitRecord.defaultChoice,
    operatorId,
    openedAt: awaitRecord.openedAt,
    resolvedAt,
  };

  return { awaitRecord: resolvedAwait, interventionRecord };
}

export function snapshotFromMatchState(snapshotId: string, capturedAt: string, state: MatchState): ReplaySnapshot {
  const snapshot: ReplaySnapshot = {
    snapshotId,
    runId: state.runId,
    cursor: state.current,
    capturedAt,
    state: {
      cursor: state.current,
      aliveAgentIds: [...state.aliveAgentIds],
      eliminatedAgentIds: [...state.eliminatedAgentIds],
      scoreByAgent: cloneScoreMap(state.scoreByAgent),
      openAwaitIds: [...state.openAwaitIds],
    },
  };

  assertValid(validateReplaySnapshot(snapshot), 'replay snapshot is invalid');
  return snapshot;
}

export function createReplayBundle(input: ReplayBundleInput): ReplayBundle {
  const cursors = [
    ...input.publicEvents.map((event) => event.cursor),
    ...(input.snapshots ?? []).map((snapshot) => snapshot.cursor),
    ...(input.markers ?? []).map((marker) => marker.cursor),
  ];
  const rounds = new Set(cursors.map((cursor) => cursor.round));
  for (const round of rounds) {
    if (!cursors.some((cursor) => cursor.round === round && cursor.phase === 'cast_intro')) {
      cursors.push({ round, phase: 'cast_intro' });
    }
  }

  const bundle: ReplayBundle = {
    runId: input.runId,
    timeline: uniqueSortedCursors(cursors),
    snapshots: [...(input.snapshots ?? [])],
    markers: [...(input.markers ?? [])],
  };

  assertValid(validateReplayBundle(bundle), 'replay bundle is invalid');
  return bundle;
}

export function createArtifactBundle(input: ArtifactBundleInput): ArtifactBundle {
  assertValid(validateRunManifest(input.manifest), 'manifest is invalid');
  assertValid(validateRoster(input.roster), 'roster is invalid');

  const replayBundleInput: ReplayBundleInput = {
    runId: input.manifest.runId,
    publicEvents: input.publicEvents,
  };

  if (input.snapshots) {
    replayBundleInput.snapshots = input.snapshots;
  }

  if (input.markers) {
    replayBundleInput.markers = input.markers;
  }

  const replayBundle = createReplayBundle(replayBundleInput);

  const bundle: ArtifactBundle = {
    manifest: input.manifest,
    replayBundle,
    roster: [...input.roster],
    publicEvents: [...input.publicEvents],
    structuredCommitments: [...(input.structuredCommitments ?? [])],
    privateArtifacts: [...(input.privateArtifacts ?? [])],
    alerts: [...(input.alerts ?? [])],
    interventions: [...(input.interventions ?? [])],
    taskOutputs: [...(input.taskOutputs ?? [])],
    finalScores: [...(input.finalScores ?? [])],
  };

  assertValid(validateArtifactBundle(bundle), 'artifact bundle is invalid');
  return bundle;
}

function validateRoster(roster: readonly RosterEntry[]): string[] {
  const errors = roster.flatMap((entry) => validateRosterEntry(entry));

  if (roster.length !== 6) {
    errors.push(`roster must contain exactly 6 agents, got ${roster.length}`);
  }

  const roleCounts = roster.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.role] = (counts[entry.role] ?? 0) + 1;
    return counts;
  }, {});

  if ((roleCounts.contender ?? 0) !== 4) {
    errors.push(`roster must contain exactly 4 contenders, got ${roleCounts.contender ?? 0}`);
  }

  if ((roleCounts.analyst ?? 0) !== 1) {
    errors.push(`roster must contain exactly 1 analyst, got ${roleCounts.analyst ?? 0}`);
  }

  if ((roleCounts.saboteur ?? 0) !== 1) {
    errors.push(`roster must contain exactly 1 saboteur, got ${roleCounts.saboteur ?? 0}`);
  }

  return errors;
}

function validateRosterEntry(entry: RosterEntry): string[] {
  return validateAgainstSchema(RosterEntrySchema, entry);
}

function validateReplaySnapshot(snapshot: ReplaySnapshot): string[] {
  return validateAgainstSchema(ReplaySnapshotSchema, snapshot);
}

function validateFinalScoreRow(row: FinalScoreRow): string[] {
  return validateAgainstSchema(FinalScoreRowSchema, row);
}

function validateAgainstSchema<T>(schema: { [key: string]: unknown }, value: T): string[] {
  if (Value.Check(schema as TSchema, value)) {
    return [];
  }

  return [...Value.Errors(schema as TSchema, value)].map((error) => `${error.path || '/'} ${error.message}`.trim());
}
