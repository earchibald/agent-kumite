import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  advanceMatchState,
  computeFinalOutcome,
  computeRoundScoreDeltas,
  createArtifactBundle,
  createInitialMatchState,
  determineElimination,
  dmBudgetForRound,
  resolveAwaitByDefault,
  snapshotFromMatchState,
  spendDmBudget,
  validateArtifactBundle,
  type ArtifactBundle,
  type AwaitRecord,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('core harness engine', () => {
  const artifactFixture = readFixture<ArtifactBundle>('artifact-bundle.minimal.c5.json');
  const manifest: RunManifest = artifactFixture.manifest;
  const roster: RosterEntry[] = artifactFixture.roster;

  it('creates and advances match state with canonical DM budgets', () => {
    const initial = createInitialMatchState(manifest, roster);
    expect(initial.current).toEqual({ round: 1, phase: 'cast_intro' });
    expect(initial.dmBudgetByAgent['agent-alpha']).toBe(dmBudgetForRound(1));

    const spent = spendDmBudget(initial, 'agent-alpha', 2);
    expect(spent.dmBudgetByAgent['agent-alpha']).toBe(3);

    let advanced = spent;
    for (let step = 0; step < 9; step += 1) {
      advanced = advanceMatchState(advanced);
    }

    expect(advanced.current).toEqual({ round: 2, phase: 'cast_intro' });
    expect(advanced.dmBudgetByAgent['agent-alpha']).toBe(dmBudgetForRound(2));
  });

  it('computes plurality elimination with tie-as-no-elimination', () => {
    const plurality = determineElimination(3, {
      'agent-alpha': 'agent-saboteur',
      'agent-bravo': 'agent-saboteur',
      'agent-charlie': 'agent-alpha',
    });
    expect(plurality.eliminatedAgentId).toBe('agent-saboteur');
    expect(plurality.isTie).toBe(false);

    const tie = determineElimination(4, {
      'agent-alpha': 'agent-saboteur',
      'agent-bravo': 'agent-alpha',
    });
    expect(tie.eliminatedAgentId).toBeNull();
    expect(tie.isTie).toBe(true);
  });

  it('computes round scoring with analyst and saboteur adjustments', () => {
    const deltas = computeRoundScoreDeltas({
      round: 3,
      roster,
      aliveAgentIds: roster.map((entry) => entry.agentId),
      taskScores: {
        'agent-alpha': 1,
        'agent-analyst': 2,
        'agent-saboteur': 2,
      },
      intendedVotes: {
        'agent-alpha': 'agent-alpha',
        'agent-analyst': 'agent-alpha',
        'agent-saboteur': 'agent-alpha',
      },
      eliminatedAgentId: 'agent-alpha',
      saboteurBonusAgentIds: ['agent-saboteur'],
    });

    expect(deltas['agent-alpha']).toBe(3);
    expect(deltas['agent-analyst']).toBe(3);
    expect(deltas['agent-saboteur']).toBe(7);
  });

  it('computes final outcomes with survival and sole-survivor bonuses', () => {
    const outcome = computeFinalOutcome({
      roster,
      scoreTotals: {
        'agent-alpha': 6,
        'agent-bravo': 5,
        'agent-charlie': 4,
        'agent-delta': 5,
        'agent-analyst': 4,
        'agent-saboteur': 6,
      },
      aliveAgentIds: ['agent-saboteur'],
      roundDeltasByAgent: {
        'agent-alpha': [2, 2, 2],
        'agent-bravo': [2, 1, 2],
        'agent-charlie': [1, 1, 2],
        'agent-delta': [2, 1, 2],
        'agent-analyst': [1, 1, 2],
        'agent-saboteur': [2, 2, 2],
      },
    });

    expect(outcome.winnerIds).toEqual(['agent-saboteur']);
    const saboteurRow = outcome.finalScores.find((row) => row.agentId === 'agent-saboteur');
    expect(saboteurRow?.total).toBe(21);
    expect(saboteurRow?.winnerShare).toBe(1);
  });

  it('resolves awaiting records through explicit default branches', () => {
    const awaitRecord = readFixture<AwaitRecord>('awaiting.approval.c5.json');
    const resolution = resolveAwaitByDefault(awaitRecord, 'C4', '2026-05-14T08:00:00Z');

    expect(resolution.awaitRecord.status).toBe('resolved');
    expect(resolution.interventionRecord.choiceId).toBe('reject');
    expect(resolution.interventionRecord.resolvedAt).toBe('2026-05-14T08:00:00Z');
  });

  it('emits replay and artifact bundles from runtime inputs', () => {
    const state = createInitialMatchState(manifest, roster);
    const afterRoundOne = Array.from({ length: 9 }).reduce((current) => advanceMatchState(current), state);
    const snapshot = snapshotFromMatchState('snapshot_round2_open', '2026-05-14T08:10:00Z', afterRoundOne);

    const generated = createArtifactBundle({
      manifest,
      roster,
      publicEvents: artifactFixture.publicEvents,
      structuredCommitments: artifactFixture.structuredCommitments,
      privateArtifacts: artifactFixture.privateArtifacts,
      alerts: artifactFixture.alerts,
      interventions: artifactFixture.interventions,
      taskOutputs: artifactFixture.taskOutputs,
      finalScores: artifactFixture.finalScores,
      snapshots: [snapshot, ...artifactFixture.replayBundle.snapshots],
      markers: artifactFixture.replayBundle.markers,
    });

    expect(generated.replayBundle.timeline[0]).toEqual({ round: 2, phase: 'cast_intro' });
    expect(generated.replayBundle.timeline).toContainEqual({ round: 3, phase: 'task_submission' });
    expect(validateArtifactBundle(generated)).toEqual([]);
  });
});
