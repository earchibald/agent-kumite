import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createControlRoomProjection,
  createReplaySnapshotDiff,
  findReplayMarkerJump,
  parseProjectionCliArgs,
  parseReplayCliArgs,
  writeControlRoomProjectionFromFile,
  writeReplayLabHelpersFromFile,
  type ArtifactBundle,
} from '../src/index.ts';

function fixturePath(name: string): string {
  return new URL(`../fixtures/${name}`, import.meta.url).pathname;
}

async function loadArtifactFixture(): Promise<ArtifactBundle> {
  return JSON.parse(await readFile(fixturePath('artifact-bundle.minimal.c5.json'), 'utf8')) as ArtifactBundle;
}

describe('replay-lab helpers', () => {
  it('resolves marker jumps and snapshot diffs from control-room projections', async () => {
    const artifactFixture = await loadArtifactFixture();
    const projection = createControlRoomProjection(artifactFixture);

    const jump = findReplayMarkerJump(projection, 'marker_alert_approval_pending');
    const diff = createReplaySnapshotDiff(
      projection,
      { round: 3, phase: 'public_square' },
      { round: 3, phase: 'task_submission' },
    );

    expect(jump.marker.label).toContain('human approval');
    expect(jump.resolvedCursor).toEqual({ round: 3, phase: 'task_submission' });
    expect(jump.sourceRecordIds).toEqual(['await_match_seed_0001_round3_publish']);

    expect(diff.publicStream.eventIds.added).toEqual(['evt_r3_task_guard_01']);
    expect(diff.publicStream.markerIds.added).toEqual([
      'marker_alert_approval_pending',
      'marker_divergence_saboteur_task_plan',
      'marker_round3_await_open',
      'marker_round3_scores_bookmark',
    ]);
    expect(diff.privateState.artifactIds.added).toEqual(['trace_r3_saboteur_01']);
    expect(diff.alerts.alertIds.added).toEqual(['alert_approval_pending']);
    expect(diff.interventionQueue.interventionIds.added).toEqual(['intervention_round3_publish_guard']);
  });

  it('writes deterministic replay-helper JSON from a projection file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-replay-'));
    const projectionPath = join(dir, 'control-room.json');
    const replayPath = join(dir, 'replay-lab.json');

    await writeControlRoomProjectionFromFile(
      parseProjectionCliArgs(['--input', fixturePath('artifact-bundle.minimal.c5.json'), '--output', projectionPath, '--pretty']),
    );

    const parsed = parseReplayCliArgs([
      '--input',
      projectionPath,
      '--output',
      replayPath,
      '--marker',
      'marker_round3_await_open',
      '--from',
      '3:public_square',
      '--to',
      '3:task_submission',
      '--pretty',
    ]);

    const result = await writeReplayLabHelpersFromFile(parsed);
    const written = JSON.parse(await readFile(result.outputPath, 'utf8'));

    expect(written.runId).toBe('run_c5_seed_0001');
    expect(written.markerJumps).toHaveLength(4);
    expect(written.selectedMarkerJump.marker.markerId).toBe('marker_round3_await_open');
    expect(written.snapshotDiff.publicStream.eventIds.added).toEqual(['evt_r3_task_guard_01']);
    expect(written.snapshotDiff.privateState.artifactIds.added).toEqual(['trace_r3_saboteur_01']);
  });
});
