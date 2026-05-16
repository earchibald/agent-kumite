import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopesToRunStore,
  appendAcpLiveRunStoreFromFiles,
  createAcpLiveRunStore,
  normalizeAcpLiveRunStoreInput,
  parseLiveStoreAppendCliArgs,
  serializeAcpLiveRunStore,
  writeAcpLiveRunStoreToFile,
  type AcpIngressEnvelope,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('live run-store append adapter', () => {
  const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
  const roster = readFixture<RosterEntry[]>('roster.demo.json');
  const ingress = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');

  it('appends new ACP ingress onto an existing persisted live run-store file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-append-'));
    const basePath = join(dir, 'base-live-run-store.json');
    const outputPath = join(dir, 'updated-live-run-store.json');
    const seedIngress = ingress.slice(0, 1);
    const tailIngress = ingress.slice(1);

    const baseStore = appendAcpIngressEnvelopesToRunStore(
      createAcpLiveRunStore({ manifest, roster }),
      seedIngress,
    );
    await writeAcpLiveRunStoreToFile(basePath, baseStore, true);

    const parsed = parseLiveStoreAppendCliArgs([
      '--store-input',
      basePath,
      '--ingress',
      new URL('../fixtures/acp-ingress.sequence.c5.json', import.meta.url).pathname,
      '--output',
      outputPath,
      '--pretty',
    ]);
    parsed.ingressPath = new URL('../fixtures/acp-ingress.sequence.c5.json', import.meta.url).pathname;
    await writeAcpLiveRunStoreToFile(basePath, baseStore, true);

    const tailPath = join(dir, 'tail-ingress.json');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(tailPath, JSON.stringify(tailIngress, null, 2)));
    parsed.ingressPath = tailPath;

    const result = await appendAcpLiveRunStoreFromFiles(parsed);
    const written = normalizeAcpLiveRunStoreInput(JSON.parse(await readFile(result.outputPath, 'utf8')));
    const expected = serializeAcpLiveRunStore(
      appendAcpIngressEnvelopesToRunStore(
        createAcpLiveRunStore({ manifest, roster }),
        ingress,
      ),
    );

    expect(written).toEqual(expected);
    expect(written.state.interventions).toHaveLength(2);
    expect(written.state.snapshots).toHaveLength(4);
  });
});
