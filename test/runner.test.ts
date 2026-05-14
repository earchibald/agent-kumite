import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  runDeterministicMatch,
  validateArtifactBundle,
  type ArtifactBundle,
  type AwaitRecord,
  type RosterEntry,
  type RunManifest,
  type StructuredCommitmentEnvelope,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('deterministic harness runner', () => {
  const artifactFixture = readFixture<ArtifactBundle>('artifact-bundle.minimal.c5.json');
  const c4Manifest = readFixture<RunManifest>('run-manifest.c4.json');
  const c5Await = readFixture<AwaitRecord>('awaiting.approval.c5.json');
  const roster: RosterEntry[] = artifactFixture.roster;
  const roundThreeCommitments: StructuredCommitmentEnvelope[] = (
    artifactFixture.structuredCommitments as StructuredCommitmentEnvelope[]
  ).map((envelope) => ({
    ...envelope,
    runId: c4Manifest.runId,
    matchId: c4Manifest.matchId,
  }));

  it('simulates a complete C4 run into canonical artifacts', () => {
    const result = runDeterministicMatch({
      manifest: c4Manifest,
      roster,
      rounds: [
        {
          publicUtterances: [
            { agentId: 'agent-alpha', text: 'Alpha opens negotiations.' },
            { agentId: 'agent-saboteur', text: 'Saboteur keeps options open.' },
          ],
          dmSpends: {
            'agent-alpha': 2,
            'agent-bravo': 1,
          },
          taskScores: {
            'agent-alpha': 2,
            'agent-bravo': 1,
            'agent-charlie': 1,
            'agent-delta': 2,
            'agent-analyst': 1,
            'agent-saboteur': 2,
          },
        },
        {
          publicUtterances: [{ agentId: 'agent-bravo', text: 'Bravo pushes for consensus.' }],
          dmSpends: {
            'agent-saboteur': 1,
          },
          taskScores: {
            'agent-alpha': 1,
            'agent-bravo': 2,
            'agent-charlie': 1,
            'agent-delta': 1,
            'agent-analyst': 2,
            'agent-saboteur': 2,
          },
        },
        {
          publicUtterances: [{ agentId: 'agent-alpha', text: 'Alpha nominates Saboteur.' }],
          structuredCommitments: roundThreeCommitments,
          intendedVotes: {
            'agent-alpha': 'agent-saboteur',
            'agent-bravo': 'agent-saboteur',
            'agent-charlie': 'agent-saboteur',
            'agent-delta': 'agent-saboteur',
            'agent-analyst': 'agent-alpha',
            'agent-saboteur': 'agent-alpha',
          },
          revealedVotes: {
            'agent-alpha': 'agent-saboteur',
            'agent-bravo': 'agent-saboteur',
            'agent-charlie': 'agent-saboteur',
            'agent-delta': 'agent-saboteur',
            'agent-analyst': 'agent-alpha',
            'agent-saboteur': 'agent-alpha',
          },
          taskScores: {
            'agent-alpha': 2,
            'agent-bravo': 1,
            'agent-charlie': 1,
            'agent-delta': 1,
            'agent-analyst': 1,
            'agent-saboteur': 2,
          },
          saboteurBonusAgentIds: ['agent-saboteur'],
        },
      ],
    });

    expect(result.finalState.status).toBe('completed');
    expect(result.finalState.eliminatedAgentIds).toEqual(['agent-saboteur']);
    expect(result.finalOutcome.winnerIds).toContain('agent-alpha');
    expect(result.publicEvents.some((event) => event.kind === 'elimination')).toBe(true);
    expect(result.artifactBundle.structuredCommitments.every((envelope) => envelope.status === 'revealed')).toBe(true);
    expect(
      result.artifactBundle.structuredCommitments.flatMap((envelope) => envelope.commitments).map((commitment) => commitment.payload.commitmentType),
    ).toEqual(expect.arrayContaining(['intended_vote', 'ally_set', 'task_plan', 'betrayal_target']));
    const revealEvent = result.publicEvents.find((event) => event.kind === 'commitment_reveal');
    expect(revealEvent?.linkedCommitmentIds).toEqual(
      expect.arrayContaining([
        'commit_r3_agent_alpha_vote',
        'commit_r3_agent_alpha_allies',
        'commit_r3_agent_saboteur_task_plan',
        'commit_r3_agent_saboteur_betrayal',
      ]),
    );
    expect(result.snapshots).toHaveLength(3);
    expect(validateArtifactBundle(result.artifactBundle)).toEqual([]);
  });

  it('auto-resolves explicit awaiting defaults in simulated runs', () => {
    const c5Manifest: RunManifest = {
      ...artifactFixture.manifest,
      condition: 'C5',
      operatorAffordanceSet: 'intervention-enabled',
    };

    const result = runDeterministicMatch({
      manifest: c5Manifest,
      roster,
      rounds: [
        {
          taskScores: {
            'agent-alpha': 1,
            'agent-bravo': 1,
            'agent-charlie': 1,
            'agent-delta': 1,
            'agent-analyst': 1,
            'agent-saboteur': 1,
          },
          awaitingDefaults: [c5Await],
        },
      ],
    });

    expect(result.interventions).toHaveLength(1);
    expect(result.interventions[0]?.choiceId).toBe('reject');
    expect(result.finalState.openAwaitIds).toEqual([]);
    expect(validateArtifactBundle(result.artifactBundle)).toEqual([]);
  });
});
