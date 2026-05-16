import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createLiveControlRoomProjection,
  reduceAcpIngressEnvelopes,
  type AcpIngressEnvelope,
  type DeterministicRunnerInput,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('ACP live control-room projections', () => {
  const envelopes = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');
  const runnerFixture = readFixture<DeterministicRunnerInput>('demo-match.input.json');
  const manifest = {
    ...runnerFixture.manifest,
    runId: 'run_demo_c5_seed_0001',
    matchId: 'match_demo_seed_0001',
    condition: 'C5' as const,
    operatorAffordanceSet: 'intervention-enabled' as const,
  };

  it('bridges reduced ACP ingress state into a live control-room projection', () => {
    const reduced = reduceAcpIngressEnvelopes({
      manifest,
      roster: runnerFixture.roster,
      envelopes,
    });
    const projection = createLiveControlRoomProjection({
      manifest,
      roster: runnerFixture.roster,
      reduced,
    });

    const publicSquareSnapshot = projection.layeredSnapshots.find(
      (snapshot) => snapshot.cursor.round === 3 && snapshot.cursor.phase === 'public_square',
    );
    const taskSubmissionSnapshot = projection.layeredSnapshots.find(
      (snapshot) => snapshot.cursor.round === 3 && snapshot.cursor.phase === 'task_submission',
    );
    const awaitOpenedReplaySnapshot = projection.replay.snapshots.find(
      (snapshot) => snapshot.snapshotId === 'acp_env_r3_await_open:snapshot',
    );
    const saboteurRow = projection.callsheet.find((row) => row.agentId === 'agent-saboteur');

    expect(projection.home.currentCursor).toEqual({ round: 3, phase: 'task_submission' });
    expect(projection.home.activeAlertCount).toBe(0);
    expect(projection.home.openAwaitCount).toBe(0);
    expect(projection.replay.timeline).toEqual([
      { round: 3, phase: 'cast_intro' },
      { round: 3, phase: 'public_square' },
      { round: 3, phase: 'task_submission' },
    ]);
    expect(publicSquareSnapshot?.interventionQueue.interventionIds).toEqual([]);
    expect(publicSquareSnapshot?.interventionQueue.pendingInterventionIds).toEqual([]);
    expect(taskSubmissionSnapshot?.interventionQueue.pendingInterventionIds).toEqual([]);
    expect(taskSubmissionSnapshot?.publicStream.markerIds).toEqual([
      'acp_env_r3_await_open:marker',
      'acp_env_r3_await_resolved:marker',
    ]);
    expect(awaitOpenedReplaySnapshot?.openAwaitIds).toEqual(['await_r3_task_approval']);
    expect(saboteurRow?.privateArtifactCount).toBe(0);
    expect(saboteurRow?.alertCount).toBe(0);
    expect(projection.live.matchStatus).toBe('live');
    expect(projection.live.openAwaitIds).toEqual([]);
    expect(projection.live.awaitingQueue).toEqual([]);
    expect(projection.live.publicEventCount).toBe(1);
    expect(projection.live.interventionCount).toBe(2);
  });
});
