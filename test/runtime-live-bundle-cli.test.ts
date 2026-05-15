import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  exportRuntimeAcpIngress,
  followLiveIngestionSocketSnapshots,
  parseRuntimeLiveBundleCliArgs,
  runBundledRuntimeLiveFlow,
  serializeAcpLiveRunStore,
  startLiveIngestionSocketDaemon,
  streamDeterministicRuntimeToLiveSocket,
  writeReplayLabHelpersFromFile,
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

describe('runtime live bundle cli lib', () => {
  const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
  const roster = readFixture<RosterEntry[]>('roster.demo.json');
  const awaitRecord = readFixture<AwaitRecord>('awaiting.approval.c5.json');

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

  it('parses bundled live args for outputs and batching', () => {
    const parsed = parseRuntimeLiveBundleCliArgs([
      '--input',
      '/tmp/match.json',
      '--store-output',
      '/tmp/store.json',
      '--projection-output',
      '/tmp/projection.json',
      '--replay-output',
      '/tmp/replay-lab.json',
      '--marker',
      'marker_round3_await_open',
      '--from',
      '3:public_square',
      '--to',
      '3:task_submission',
      '--batch-size',
      '2',
      '--request-id-prefix',
      'bundle_demo',
    ]);

    expect(parsed.storeOutputPath).toBe('/tmp/store.json');
    expect(parsed.projectionOutputPath).toBe('/tmp/projection.json');
   expect(parsed.replayOutputPath).toBe('/tmp/replay-lab.json');
   expect(parsed.markerId).toBe('marker_round3_await_open');
   expect(parsed.fromCursor).toBe('3:public_square');
   expect(parsed.toCursor).toBe('3:task_submission');
   expect(parsed.batchSize).toBe(2);
   expect(parsed.requestIdPrefix).toBe('bundle_demo');
  });

  it('matches the existing multi-step runtime stream flow and replay helpers', async () => {
   const bundledDir = await mkdtemp(join(tmpdir(), 'agent-kumite-runtime-bundle-'));
   const explicitDir = await mkdtemp(join(tmpdir(), 'agent-kumite-runtime-bundle-'));
   const bundledStoreOutput = join(bundledDir, 'store.json');
   const bundledProjectionOutput = join(bundledDir, 'projection.json');
   const bundledReplayOutput = join(bundledDir, 'replay-lab.json');
   const explicitStoreOutput = join(explicitDir, 'store.json');
   const explicitProjectionOutput = join(explicitDir, 'projection.json');
   const explicitReplayOutput = join(explicitDir, 'replay-lab.json');
   const socketPath = join(explicitDir, 'live.sock');
   const seedStorePath = join(explicitDir, 'seed-store.json');
   const envelopes = exportRuntimeAcpIngress(runtimeInput);
    const expectedStore = appendAcpIngressEnvelopesToRunStore(
      createAcpLiveRunStore({ manifest, roster }),
      envelopes,
    );

    const bundledResult = await runBundledRuntimeLiveFlow(runtimeInput, {
      storeOutputPath: bundledStoreOutput,
      projectionOutputPath: bundledProjectionOutput,
      replayOutputPath: bundledReplayOutput,
      fromCursor: '1:cast_intro',
      toCursor: '1:task_submission',
      batchSize: envelopes.length,
      requestIdPrefix: 'bundle_demo',
      pretty: true,
    });

    const seedStore = createAcpLiveRunStore({ manifest, roster });
    await import('../src/index.ts').then(({ writeAcpLiveRunStoreToFile }) =>
      writeAcpLiveRunStoreToFile(seedStorePath, seedStore, true),
    );
    const daemon = await startLiveIngestionSocketDaemon({
      socketPath,
      storePaths: [seedStorePath],
      subscriberQueueCapacity: 64,
    });
    try {
      const followPromise = followLiveIngestionSocketSnapshots({
        socketPath,
        runId: manifest.runId,
        storeOutputPath: explicitStoreOutput,
        projectionOutputPath: explicitProjectionOutput,
        pretty: true,
        reconnectDelayMs: 10,
        maxReconnects: 0,
        snapshotLimit: 1 + Math.ceil(envelopes.length / envelopes.length),
      });
      await streamDeterministicRuntimeToLiveSocket(runtimeInput, {
        socketPath,
        runId: manifest.runId,
        batchSize: envelopes.length,
        requestIdPrefix: 'bundle_demo',
      });
      await followPromise;
      await writeReplayLabHelpersFromFile({
        inputPath: explicitProjectionOutput,
        outputPath: explicitReplayOutput,
        fromCursor: '1:cast_intro',
        toCursor: '1:task_submission',
        pretty: true,
      });
    } finally {
      await daemon.stop();
    }

    const bundledStore = JSON.parse(await waitForFile(bundledStoreOutput));
    const bundledProjection = JSON.parse(await waitForFile(bundledProjectionOutput));
    const bundledReplay = JSON.parse(await waitForFile(bundledReplayOutput));
    const explicitStore = JSON.parse(await waitForFile(explicitStoreOutput));
    const explicitProjection = JSON.parse(await waitForFile(explicitProjectionOutput));
    const explicitReplay = JSON.parse(await waitForFile(explicitReplayOutput));

    expect(bundledResult.appendedEnvelopeCount).toBe(envelopes.length);
    expect(bundledResult.replayOutputPath).toBe(bundledReplayOutput);
    expect(bundledStore).toEqual(explicitStore);
    expect(bundledProjection).toEqual(explicitProjection);
    expect(bundledReplay).toEqual(explicitReplay);
    expect(explicitStore).toEqual(serializeAcpLiveRunStore(expectedStore));
  });
});
