import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopesToRunStore,
  bridgeAcpIngressToLiveSocket,
  createAcpLiveRunStore,
  currentAcpLiveControlRoomProjection,
  exportRuntimeAcpIngress,
  followLiveIngestionSocketSnapshots,
  LiveIngestionSocketServer,
  parseRuntimeAcpIngressCliArgs,
  serializeAcpLiveRunStore,
  writeRuntimeAcpIngressFromFile,
  type AwaitRecord,
  type DeterministicRunnerInput,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

async function waitForFile(path: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

describe('runtime ACP ingress export cli lib', () => {
  const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
  const roster = readFixture<RosterEntry[]>('roster.demo.json');
  const awaitRecord = readFixture<AwaitRecord>('awaiting.approval.c5.json');
  let server: LiveIngestionSocketServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  const runtimeInput: DeterministicRunnerInput = {
    manifest,
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
        awaitingDefaults: [awaitRecord],
      },
    ],
  };

  it('parses export args and writes ndjson or json-array output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-runtime-acp-'));
    const inputPath = join(dir, 'match.json');
    const outputPath = join(dir, 'ingress.ndjson');
    await writeFile(inputPath, JSON.stringify(runtimeInput, null, 2));

    const parsed = parseRuntimeAcpIngressCliArgs([
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--output-format',
      'ndjson',
    ]);
    expect(parsed.outputFormat).toBe('ndjson');

    const result = await writeRuntimeAcpIngressFromFile(parsed);
    const written = await readFile(result.outputPath, 'utf8');
    expect(written.trim().split('\n').length).toBe(result.envelopeCount);
  });

  it('exports phase transitions plus await_opened/await_resolved envelopes', () => {
    const envelopes = exportRuntimeAcpIngress(runtimeInput);
    expect(envelopes.some((envelope) => envelope.kind === 'phase_transition')).toBe(true);
    expect(envelopes.some((envelope) => envelope.kind === 'await_opened')).toBe(true);
    expect(envelopes.some((envelope) => envelope.kind === 'await_resolved')).toBe(true);
  });

  it('matches direct live-store/projection reduction through bridge and follow', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-runtime-acp-'));
    const socketPath = join(dir, 'live.sock');
    const storeOutputPath = join(dir, 'store.mirror.json');
    const projectionOutputPath = join(dir, 'projection.mirror.json');
    const envelopes = exportRuntimeAcpIngress(runtimeInput);
    const expectedStore = appendAcpIngressEnvelopesToRunStore(
      createAcpLiveRunStore({ manifest, roster }),
      envelopes,
    );
    const expectedProjection = currentAcpLiveControlRoomProjection(expectedStore);

    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [createAcpLiveRunStore({ manifest, roster })],
    });
    await server.start();

    const followPromise = followLiveIngestionSocketSnapshots({
      socketPath,
      runId: manifest.runId,
      storeOutputPath,
      projectionOutputPath,
      pretty: true,
      reconnectDelayMs: 10,
      maxReconnects: 0,
      snapshotLimit: 2,
    });
    await waitForFile(storeOutputPath);

    await bridgeAcpIngressToLiveSocket({
      socketPath,
      runId: manifest.runId,
      inputFormat: 'json-array',
      batchSize: envelopes.length,
      requestIdPrefix: 'runtime_export',
    }, Readable.from(JSON.stringify(envelopes)));
    await followPromise;

    const mirroredStore = JSON.parse(await readFile(storeOutputPath, 'utf8'));
    const mirroredProjection = JSON.parse(await readFile(projectionOutputPath, 'utf8'));

    expect(mirroredStore).toEqual(serializeAcpLiveRunStore(expectedStore));
    expect(mirroredProjection).toEqual(expectedProjection);
  });
});
