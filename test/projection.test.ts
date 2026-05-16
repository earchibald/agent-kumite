import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createControlRoomProjection,
  parseProjectionCliArgs,
  writeControlRoomProjectionFromFile,
  type ArtifactBundle,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('control-room projections', () => {
  const artifactFixture = readFixture<ArtifactBundle>('artifact-bundle.minimal.c5.json');

  it('projects a canonical artifact bundle into layered control-room state', () => {
    const projection = createControlRoomProjection(artifactFixture);
    const callsheetRow = projection.callsheet.find((row) => row.agentId === 'agent-saboteur');
    const taskSubmissionSnapshot = projection.layeredSnapshots.find(
      (snapshot) => snapshot.cursor.round === 3 && snapshot.cursor.phase === 'task_submission',
    );
    const alertMarker = projection.replay.markers.find((marker) => marker.markerId === 'marker_alert_approval_pending');

    expect(projection.home.condition).toBe('C5');
    expect(projection.home.currentCursor).toEqual({ round: 3, phase: 'simultaneous_reveal' });
    expect(projection.home.activeAlertCount).toBe(1);
    expect(projection.callsheet).toHaveLength(6);
    expect(callsheetRow?.privateArtifactCount).toBe(1);
    expect(callsheetRow?.commitmentCount).toBe(2);
    expect(taskSubmissionSnapshot?.privateState.artifactIds).toContain('trace_r3_saboteur_01');
    expect(taskSubmissionSnapshot?.alerts.alertIds).toContain('alert_approval_pending');
    expect(taskSubmissionSnapshot?.interventionQueue.interventionIds).toContain('intervention_round3_publish_guard');
    expect(taskSubmissionSnapshot?.interventionQueue.disabledPhaseOnePlaceholders).toEqual([
      'role_change',
      'freeze',
      'ejection',
    ]);
    expect(alertMarker?.cursor).toEqual({ round: 3, phase: 'task_submission' });
    expect(projection.replay.snapshots).toHaveLength(artifactFixture.replayBundle.snapshots.length);
    expect(projection.aftermath.runId).toBe(artifactFixture.manifest.runId);
  });

  it('writes deterministic projection JSON from an artifact bundle file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-projection-'));
    const outputPath = join(dir, 'control-room.json');
    const inputPath = new URL('../fixtures/artifact-bundle.minimal.c5.json', import.meta.url).pathname;

    const parsed = parseProjectionCliArgs(['--input', inputPath, '--output', outputPath, '--pretty']);
    const result = await writeControlRoomProjectionFromFile(parsed);
    const written = JSON.parse(await readFile(result.outputPath, 'utf8'));

    expect(written.home.runId).toBe('run_c5_seed_0001');
    expect(written.replay.markerCount).toBe(artifactFixture.replayBundle.markers.length);
    expect(written.replay.markers).toHaveLength(artifactFixture.replayBundle.markers.length);
    expect(written.replay.snapshots).toHaveLength(artifactFixture.replayBundle.snapshots.length);
    expect(written.layeredSnapshots).toHaveLength(artifactFixture.replayBundle.timeline.length);
    expect(written.aftermath.replayMarkerSummary.total).toBe(artifactFixture.replayBundle.markers.length);
  });
});
