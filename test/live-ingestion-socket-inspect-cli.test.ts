import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createAcpLiveRunStore,
  LiveIngestionSocketServer,
  parseLiveSocketInspectCliArgs,
  runLiveSocketInspectCommand,
  writeAcpLiveRunStoreToFile,
  type AcpIngressEnvelope,
  type RosterEntry,
  type RunManifest,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('live ingestion socket inspect cli lib', () => {
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

  it('parses subscribe arguments with defaults and limits', () => {
    const parsed = parseLiveSocketInspectCliArgs([
      'subscribe',
      '--socket',
      '/tmp/live.sock',
      '--run-id',
      manifest.runId,
      '--initial-snapshot',
      'store',
      '--limit',
      '2',
    ]);

    expect(parsed.command).toBe('subscribe');
    expect(parsed.events).toEqual(['store_updated', 'server_stopping']);
    expect(parsed.initialSnapshot).toBe('store');
    expect(parsed.limit).toBe(2);
  });

  it('runs get-store and append-ingress inspection commands against the daemon', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-inspect-'));
    const socketPath = join(dir, 'live.sock');
    const store = createAcpLiveRunStore({ manifest, roster });
    const ingressPath = join(dir, 'ingress.json');
    await writeAcpLiveRunStoreToFile(join(dir, 'store.json'), store, true);
    await import('node:fs/promises').then(({ writeFile }) => writeFile(ingressPath, JSON.stringify(ingress.slice(0, 1), null, 2)));
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [store],
    });
    await server.start();

    const storeChunks: string[] = [];
    await runLiveSocketInspectCommand(parseLiveSocketInspectCliArgs([
      'get-store',
      '--socket',
      socketPath,
      '--run-id',
      manifest.runId,
    ]), (chunk) => storeChunks.push(chunk));
    const storeOutput = JSON.parse(storeChunks.join(''));
    expect(storeOutput.manifest.runId).toBe(manifest.runId);

    const appendChunks: string[] = [];
    await runLiveSocketInspectCommand(parseLiveSocketInspectCliArgs([
      'append-ingress',
      '--socket',
      socketPath,
      '--run-id',
      manifest.runId,
      '--ingress',
      ingressPath,
    ]), (chunk) => appendChunks.push(chunk));
    const appendOutput = JSON.parse(appendChunks.join(''));
    expect(appendOutput.type).toBe('append_ingress_ok');
  });

  it('streams subscribe output until the configured limit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-inspect-'));
    const socketPath = join(dir, 'live.sock');
    server = new LiveIngestionSocketServer({
      socketPath,
      initialStores: [createAcpLiveRunStore({ manifest, roster })],
    });
    await server.start();

    const chunks: string[] = [];
    const runPromise = runLiveSocketInspectCommand(parseLiveSocketInspectCliArgs([
      'subscribe',
      '--socket',
      socketPath,
      '--run-id',
      manifest.runId,
      '--initial-snapshot',
      'projection',
      '--limit',
      '2',
    ]), (chunk) => chunks.push(chunk));
    await runPromise;

    const messages = chunks.map((chunk) => JSON.parse(chunk));
    expect(messages.map((message) => message.type)).toEqual([
      'subscribed',
      'projection_snapshot',
    ]);
  });
});
