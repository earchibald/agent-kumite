import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  exportRuntimeAcpIngress,
  reduceAcpIngressEnvelopes,
  type AcpIngressEnvelope,
  type DeterministicRunnerInput,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('ACP ingress reducer', () => {
  const envelopes = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');
  const runnerFixture = readFixture<DeterministicRunnerInput>('demo-match.input.json');
  const manifest = {
    ...runnerFixture.manifest,
    runId: 'run_demo_c5_seed_0001',
    matchId: 'match_demo_seed_0001',
    condition: 'C5' as const,
    operatorAffordanceSet: 'intervention-enabled' as const,
  };

  it('reduces ingress envelopes into evolving match state', () => {
    const reduced = reduceAcpIngressEnvelopes({
      manifest,
      roster: runnerFixture.roster,
      envelopes,
    });

    expect(reduced.matchState.current).toEqual({ round: 3, phase: 'task_submission' });
    expect(reduced.matchState.status).toBe('live');
    expect(reduced.matchState.openAwaitIds).toEqual([]);
    expect(reduced.matchState.layers.publicEventIds).toEqual(['acp_env_r3_phase_open:event']);
    expect(reduced.matchState.layers.interventionQueueIds).toEqual([]);
    expect(reduced.awaitRecords).toHaveLength(1);
    expect(reduced.awaitRecords[0]).toMatchObject({
      awaitId: 'await_r3_task_approval',
      status: 'resolved',
    });
    expect(reduced.interventions).toHaveLength(2);
  });

  it('emits replay snapshots and markers from ingress activity', () => {
    const reduced = reduceAcpIngressEnvelopes({
      manifest,
      roster: runnerFixture.roster,
      envelopes,
    });

    expect(reduced.snapshots).toHaveLength(4);
    expect(reduced.snapshots.map((snapshot) => snapshot.snapshotId)).toEqual([
      'snapshot_ingress_start',
      'acp_env_r3_phase_open:snapshot',
      'acp_env_r3_await_open:snapshot',
      'acp_env_r3_await_resolved:snapshot',
    ]);
    expect(reduced.markers).toHaveLength(2);
    expect(reduced.replayBundle.markers).toHaveLength(2);
    expect(reduced.replayBundle.timeline).toEqual([
      { round: 3, phase: 'cast_intro' },
      { round: 3, phase: 'public_square' },
      { round: 3, phase: 'task_submission' },
    ]);
  });

  it('absorbs exported runtime deltas into canonical live state', () => {
    const exported = exportRuntimeAcpIngress(runnerFixture);
    const reduced = reduceAcpIngressEnvelopes({
      manifest: runnerFixture.manifest,
      roster: runnerFixture.roster,
      envelopes: exported,
    });

    expect(reduced.matchState.structuredCommitments).toHaveLength(2);
    expect(reduced.matchState.structuredCommitments.every((envelope) => envelope.status === 'revealed')).toBe(true);
    expect(reduced.matchState.eliminatedAgentIds).toContain('agent-saboteur');
    expect(reduced.matchState.aliveAgentIds).not.toContain('agent-saboteur');
    expect(reduced.matchState.scoreByAgent['agent-alpha']).toBeGreaterThan(0);
    expect(reduced.publicEvents.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        'round_open',
        'public_utterance',
        'vote_reveal',
        'commitment_reveal',
        'elimination',
        'score_delta',
      ]),
    );
    expect(reduced.markers.map((marker) => marker.markerType)).toEqual(
      expect.arrayContaining(['reveal', 'elimination', 'bookmark']),
    );
  });
});
