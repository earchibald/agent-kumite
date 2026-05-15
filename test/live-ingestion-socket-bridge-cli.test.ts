import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bridgeAcpIngressToLiveSocket,
  createAcpLiveRunStore,
  followLiveIngestionSocketSnapshots,
  LiveIngestionSocketServer,
  parseLiveIngestionSocketBridgeCliArgs,
  type AcpIngressEnvelope,
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

describe('live ingestion socket bridge cli lib', () => {
  const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
  const roster = readFixture<RosterEntry[]>('roster.demo.json');
  const ingress = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');
  let server: LiveIngestionSocketServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('parses bridge args for input format and stable request id prefix', () => {
    const parsed = parseLiveIngestionSocketBridgeCliArgs([
      '--socket',
      '/tmp/live.sock',
      '--run-id',
      manifest.runId,
      '--input',
      '/tmp/ingress.ndjson',
      '--input-format',
      'ndjson',
      '--batch-size',
      '2',
      '--request-id-prefix',
      'bridge_demo',
    ]);

    expect(parsed.inputFormat).toBe('ndjson');
    expect(parsed.batchSize).toBe(2);
    expect(parsed.requestIdPrefix).toBe('bridge_demo');
  });

  it('bridges ndjson ACP ingress into the live socket with stable request ids', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-bridge-'));
    const socketPath = join(dir, 'live.sock');
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [createAcpLiveRunStore({ manifest, roster })],
    });
    await server.start();

    const input = Readable.from(`${JSON.stringify(ingress[0])}\n${JSON.stringify(ingress[1])}\n`);
    const result = await bridgeAcpIngressToLiveSocket({
      socketPath,
      runId: manifest.runId,
      inputFormat: 'ndjson',
      batchSize: 1,
      requestIdPrefix: 'bridge_req',
    }, input);

    expect(result.appendedEnvelopeCount).toBe(2);
    expect(result.requestIds).toEqual([
      'bridge_req_000000',
      'bridge_req_000001',
    ]);
  });

  it('drives the daemon/follow flow end-to-end from a json-array bridge input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-bridge-'));
    const socketPath = join(dir, 'live.sock');
    const storeOutputPath = join(dir, 'store.mirror.json');
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [createAcpLiveRunStore({ manifest, roster })],
    });
    await server.start();

    const followPromise = followLiveIngestionSocketSnapshots({
      socketPath,
      runId: manifest.runId,
      storeOutputPath,
      pretty: true,
      reconnectDelayMs: 10,
      maxReconnects: 0,
      snapshotLimit: 2,
    });
    await waitForFile(storeOutputPath);

    const inputPath = join(dir, 'ingress.json');
    await writeFile(inputPath, JSON.stringify(ingress.slice(0, 1), null, 2));

    const bridgeResult = await bridgeAcpIngressToLiveSocket({
      socketPath,
      runId: manifest.runId,
      inputPath,
      inputFormat: 'json-array',
      batchSize: 1,
      requestIdPrefix: 'bridge_array',
    }, Readable.from(JSON.stringify(ingress.slice(0, 1))));
    const followResult = await followPromise;
    const mirroredStore = JSON.parse(await readFile(storeOutputPath, 'utf8'));

    expect(bridgeResult.requestIds).toEqual(['bridge_array_000000']);
    expect(followResult.terminationReason).toBe('snapshot_limit_reached');
    expect(mirroredStore.state.publicEvents.length).toBeGreaterThan(0);
  });
});
