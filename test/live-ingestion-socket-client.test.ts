import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  appendIngressViaLiveSocket,
  createAcpLiveRunStore,
  getLiveProjectionViaSocket,
  getLiveRunStoreViaSocket,
  LiveIngestionSocketProtocolError,
  LiveIngestionSocketServer,
  serializeAcpLiveRunStore,
  subscribeToLiveRun,
  type AcpIngressEnvelope,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('live ingestion socket client helpers', () => {
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

  it('gets the canonical store and projection through client helpers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-client-'));
    const socketPath = join(dir, 'live.sock');
    const store = createAcpLiveRunStore({ manifest, roster });
    server = new LiveIngestionSocketServer({ socketPath, initialStores: [store] });
    await server.start();

    const returnedStore = await getLiveRunStoreViaSocket({
      socketPath,
      runId: manifest.runId,
      requestId: 'req_get_store_helper',
    });
    const projection = await getLiveProjectionViaSocket({
      socketPath,
      runId: manifest.runId,
      requestId: 'req_get_projection_helper',
    });

    expect(returnedStore).toEqual(serializeAcpLiveRunStore(store));
    expect(projection.home.runId).toBe(manifest.runId);
  });

  it('appends ingress and surfaces protocol errors as typed exceptions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-client-'));
    const socketPath = join(dir, 'live.sock');
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [createAcpLiveRunStore({ manifest, roster })],
    });
    await server.start();

    const response = await appendIngressViaLiveSocket({
      socketPath,
      runId: manifest.runId,
      requestId: 'req_append_helper',
      envelopes: ingress.slice(0, 1),
    });
    expect(response.type).toBe('append_ingress_ok');
    expect((response.payload as { store_revision: number }).store_revision).toBe(1);

    await expect(appendIngressViaLiveSocket({
      socketPath,
      runId: 'missing_run',
      requestId: 'req_missing_run',
      envelopes: ingress.slice(0, 1),
    })).rejects.toBeInstanceOf(LiveIngestionSocketProtocolError);
  });

  it('subscribes to a run and buffers streamed messages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-client-'));
    const socketPath = join(dir, 'live.sock');
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [createAcpLiveRunStore({ manifest, roster })],
    });
    await server.start();

    const subscription = await subscribeToLiveRun({
      socketPath,
      runId: manifest.runId,
      requestId: 'req_subscribe_helper',
      events: ['store_updated', 'server_stopping'],
      initialSnapshot: 'projection',
    });

    const subscribed = await subscription.nextMessage();
    const snapshot = await subscription.nextMessage();
    await appendIngressViaLiveSocket({
      socketPath,
      runId: manifest.runId,
      requestId: 'req_append_subscription_helper',
      envelopes: ingress.slice(0, 1),
    });
    const update = await subscription.nextMessage();
    subscription.close();

    expect(subscribed.type).toBe('subscribed');
    expect(snapshot.type).toBe('projection_snapshot');
    expect(update.type).toBe('store_updated');
  });
});
