import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  currentAcpLiveControlRoomProjection,
  parseLiveProjectionCliArgs,
  writeLiveControlRoomProjectionFromFiles,
  type AcpIngressEnvelope,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('live control-room projection adapter', () => {
  const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
  const roster = readFixture<RosterEntry[]>('roster.demo.json');
  const ingress = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');

  it('writes deterministic live projection JSON from manifest, roster, and ACP ingress files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-project-'));
    const outputPath = join(dir, 'live-control-room.json');

    const parsed = parseLiveProjectionCliArgs([
      '--manifest',
      new URL('../fixtures/run-manifest.live.c5.json', import.meta.url).pathname,
      '--roster',
      new URL('../fixtures/roster.demo.json', import.meta.url).pathname,
      '--ingress',
      new URL('../fixtures/acp-ingress.sequence.c5.json', import.meta.url).pathname,
      '--output',
      outputPath,
      '--pretty',
    ]);
    const result = await writeLiveControlRoomProjectionFromFiles(parsed);
    const written = JSON.parse(await readFile(result.outputPath, 'utf8'));
    const expected = currentAcpLiveControlRoomProjection(
      appendAcpIngressEnvelopesToRunStore(
        createAcpLiveRunStore({ manifest, roster }),
        ingress,
      ),
    );

    expect(written).toEqual(expected);
    expect(written.home.runId).toBe('run_demo_c5_seed_0001');
    expect(written.live.matchStatus).toBe('live');
    expect(written.live.interventionCount).toBe(2);
    expect(written.replay.snapshots).toHaveLength(4);
  });
});
