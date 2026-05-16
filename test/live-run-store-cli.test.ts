import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  normalizeAcpLiveRunStoreInput,
  parseLiveRunStoreCliArgs,
  serializeAcpLiveRunStore,
  writeAcpLiveRunStoreFromFiles,
  type AcpIngressEnvelope,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('live run-store persistence adapter', () => {
  const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
  const roster = readFixture<RosterEntry[]>('roster.demo.json');
  const ingress = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');

  it('writes deterministic live run-store JSON from manifest, roster, and ACP ingress files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-store-'));
    const outputPath = join(dir, 'live-run-store.json');

    const parsed = parseLiveRunStoreCliArgs([
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
    const result = await writeAcpLiveRunStoreFromFiles(parsed);
    const written = normalizeAcpLiveRunStoreInput(JSON.parse(await readFile(result.outputPath, 'utf8')));
    const expected = serializeAcpLiveRunStore(
      appendAcpIngressEnvelopesToRunStore(
        createAcpLiveRunStore({ manifest, roster }),
        ingress,
      ),
    );

    expect(written).toEqual(expected);
    expect(written.manifest.runId).toBe('run_demo_c5_seed_0001');
    expect(written.state.interventions).toHaveLength(2);
    expect(written.state.snapshots).toHaveLength(4);
  });
});
