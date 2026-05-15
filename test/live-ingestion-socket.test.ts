import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  currentAcpLiveControlRoomProjection,
  LiveIngestionSocketServer,
  serializeAcpLiveRunStore,
  type AcpIngressEnvelope,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

async function sendOneShot(socketPath: string, message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';

    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex);
      resolve(JSON.parse(line) as Record<string, unknown>);
      socket.end();
    });
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(message)}\n`);
    });
  });
}

describe('live ingestion socket server', () => {
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

  it('serves append_ingress, get_store, and get_projection over newline-delimited JSON UDS', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-socket-'));
    const socketPath = join(dir, 'live.sock');
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [
        createAcpLiveRunStore({ manifest, roster }),
      ],
    });
    await server.start();

    const appendResponse = await sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'append_ingress',
      request_id: 'req_append_01',
      run_id: manifest.runId,
      payload: {
        envelopes: ingress,
      },
    });
    const storeResponse = await sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'get_store',
      request_id: 'req_store_01',
      run_id: manifest.runId,
      payload: {},
    });
    const projectionResponse = await sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'get_projection',
      request_id: 'req_projection_01',
      run_id: manifest.runId,
      payload: {},
    });

    const expectedStore = appendAcpIngressEnvelopesToRunStore(
      createAcpLiveRunStore({ manifest, roster }),
      ingress,
    );

    expect(appendResponse.type).toBe('append_ingress_ok');
    expect((appendResponse.payload as { store_revision: number }).store_revision).toBe(1);
    expect(storeResponse.type).toBe('get_store_ok');
    expect((storeResponse.payload as { store: unknown }).store).toEqual(serializeAcpLiveRunStore(expectedStore));
    expect(projectionResponse.type).toBe('get_projection_ok');
    expect((projectionResponse.payload as { projection: unknown }).projection).toEqual(
      currentAcpLiveControlRoomProjection(expectedStore),
    );
  });

  it('dedupes append_ingress by request_id and rejects conflicting reuse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-socket-'));
    const socketPath = join(dir, 'live.sock');
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [
        createAcpLiveRunStore({ manifest, roster }),
      ],
    });
    await server.start();

    const first = await sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'append_ingress',
      request_id: 'req_append_dedupe',
      run_id: manifest.runId,
      payload: {
        envelopes: ingress.slice(0, 1),
      },
    });
    const second = await sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'append_ingress',
      request_id: 'req_append_dedupe',
      run_id: manifest.runId,
      payload: {
        envelopes: ingress.slice(0, 1),
      },
    });
    const conflicting = await sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'append_ingress',
      request_id: 'req_append_dedupe',
      run_id: manifest.runId,
      payload: {
        envelopes: ingress,
      },
    });

    expect(second).toEqual(first);
    expect(conflicting.type).toBe('error');
    expect((conflicting.payload as { code: string }).code).toBe('request_id_conflict');
  });
});
