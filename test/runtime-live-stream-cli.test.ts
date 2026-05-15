import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  currentAcpLiveControlRoomProjection,
  exportRuntimeAcpIngress,
  followLiveIngestionSocketSnapshots,
  LiveIngestionSocketServer,
  parseRuntimeLiveStreamCliArgs,
  serializeAcpLiveRunStore,
  streamDeterministicRuntimeToLiveSocket,
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

describe('runtime live stream cli lib', () => {
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

  it('parses direct stream args with explicit run id and batching', () => {
    const parsed = parseRuntimeLiveStreamCliArgs([
      '--input',
      '/tmp/match.json',
      '--socket',
      '/tmp/live.sock',
      '--run-id',
      manifest.runId,
      '--batch-size',
      '2',
      '--request-id-prefix',
      'runtime_direct',
    ]);

    expect(parsed.runId).toBe(manifest.runId);
    expect(parsed.batchSize).toBe(2);
    expect(parsed.requestIdPrefix).toBe('runtime_direct');
  });

  it('rejects run id mismatches between the input and stream target', async () => {
    await expect(streamDeterministicRuntimeToLiveSocket(runtimeInput, {
      socketPath: '/tmp/live.sock',
      runId: 'wrong_run',
      batchSize: 1,
      requestIdPrefix: 'runtime_direct',
    })).rejects.toThrow('does not match --run-id');
  });

  it('matches the exported ACP path through daemon and follow', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-runtime-stream-'));
    const socketPath = join(dir, 'live.sock');
    const storeOutputPath = join(dir, 'store.mirror.json');
    const projectionOutputPath = join(dir, 'projection.mirror.json');
    const expectedIngress = exportRuntimeAcpIngress(runtimeInput);
    const expectedStore = appendAcpIngressEnvelopesToRunStore(
      createAcpLiveRunStore({ manifest, roster }),
      expectedIngress,
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

    const streamResult = await streamDeterministicRuntimeToLiveSocket(runtimeInput, {
      socketPath,
      runId: manifest.runId,
      batchSize: expectedIngress.length,
      requestIdPrefix: 'runtime_direct',
    });
    await followPromise;

    const mirroredStore = JSON.parse(await readFile(storeOutputPath, 'utf8'));
    const mirroredProjection = JSON.parse(await readFile(projectionOutputPath, 'utf8'));

    expect(streamResult.batchesSent).toBe(1);
    expect(mirroredStore).toEqual(serializeAcpLiveRunStore(expectedStore));
    expect(mirroredProjection).toEqual(expectedProjection);
  });
});
