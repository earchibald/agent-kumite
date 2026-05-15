import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  appendIngressViaLiveSocket,
  createAcpLiveRunStore,
  followLiveIngestionSocketSnapshots,
  LiveIngestionSocketServer,
  parseLiveIngestionSocketFollowCliArgs,
  serializeAcpLiveRunStore,
  writeReplayLabHelpersFromFile,
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

describe('live ingestion socket follow cli lib', () => {
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

  it('parses follow args with outputs and reconnect controls', () => {
    const parsed = parseLiveIngestionSocketFollowCliArgs([
      '--socket',
      '/tmp/live.sock',
      '--run-id',
      manifest.runId,
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
      '--max-reconnects',
      '2',
      '--reconnect-delay-ms',
      '10',
      '--snapshot-limit',
      '3',
    ]);

    expect(parsed.storeOutputPath).toBe('/tmp/store.json');
    expect(parsed.projectionOutputPath).toBe('/tmp/projection.json');
    expect(parsed.replayOutputPath).toBe('/tmp/replay-lab.json');
    expect(parsed.markerId).toBe('marker_round3_await_open');
    expect(parsed.fromCursor).toBe('3:public_square');
    expect(parsed.toCursor).toBe('3:task_submission');
    expect(parsed.maxReconnects).toBe(2);
    expect(parsed.reconnectDelayMs).toBe(10);
    expect(parsed.snapshotLimit).toBe(3);
  });

  it('mirrors bootstrap and update snapshots to local store and projection files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-follow-'));
    const socketPath = join(dir, 'live.sock');
    const storeOutputPath = join(dir, 'store.snapshot.json');
    const projectionOutputPath = join(dir, 'projection.snapshot.json');
    const replayOutputPath = join(dir, 'replay.snapshot.json');
    const expectedReplayOutputPath = join(dir, 'replay.expected.json');
    const baseStore = createAcpLiveRunStore({ manifest, roster });
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [baseStore],
    });
    await server.start();

    const followPromise = followLiveIngestionSocketSnapshots({
      socketPath,
      runId: manifest.runId,
      storeOutputPath,
      projectionOutputPath,
      replayOutputPath,
      pretty: true,
      reconnectDelayMs: 10,
      maxReconnects: 0,
      snapshotLimit: 2,
    });

    const initialStore = JSON.parse(await waitForFile(storeOutputPath));
    expect(initialStore).toEqual(serializeAcpLiveRunStore(baseStore));

    await appendIngressViaLiveSocket({
      socketPath,
      runId: manifest.runId,
      requestId: 'req_follow_append',
      envelopes: ingress.slice(0, 1),
    });

    const result = await followPromise;
    const mirroredStore = JSON.parse(await readFile(storeOutputPath, 'utf8'));
    const mirroredProjection = JSON.parse(await readFile(projectionOutputPath, 'utf8'));
    const mirroredReplay = JSON.parse(await readFile(replayOutputPath, 'utf8'));

    await writeReplayLabHelpersFromFile({
      inputPath: projectionOutputPath,
      outputPath: expectedReplayOutputPath,
      pretty: true,
    });
    const expectedReplay = JSON.parse(await readFile(expectedReplayOutputPath, 'utf8'));

    expect(result.terminationReason).toBe('snapshot_limit_reached');
    expect(result.mirroredSnapshotCount).toBe(2);
    expect(result.replayOutputPath).toBe(replayOutputPath);
    expect(mirroredStore.state.snapshots.length).toBeGreaterThan(0);
    expect(mirroredProjection.home.currentCursor).toEqual(mirroredStore.state.matchState.current);
    expect(mirroredReplay).toEqual(expectedReplay);
  });

  it('reconnects after server shutdown when configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-follow-'));
    const socketPath = join(dir, 'live.sock');
    const storeOutputPath = join(dir, 'store.snapshot.json');
    const baseStore = createAcpLiveRunStore({ manifest, roster });
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [baseStore],
    });
    await server.start();

    const followPromise = followLiveIngestionSocketSnapshots({
      socketPath,
      runId: manifest.runId,
      storeOutputPath,
      pretty: true,
      reconnectDelayMs: 10,
      maxReconnects: 1,
      snapshotLimit: 2,
    });

    await waitForFile(storeOutputPath);
    await server.stop();
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [baseStore],
    });
    await server.start();

    const result = await followPromise;
    expect(result.reconnectCount).toBe(1);
    expect(result.terminationReason).toBe('snapshot_limit_reached');
  });
});
