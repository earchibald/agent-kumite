import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createAcpLiveRunStore,
  parseLiveIngestionSocketCliArgs,
  startLiveIngestionSocketDaemon,
  waitForLiveIngestionSocketDaemonSignal,
  writeAcpLiveRunStoreToFile,
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

async function writeStoreFixture(dir: string, fileName: string): Promise<string> {
  const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
  const roster = readFixture<RosterEntry[]>('roster.demo.json');
  const store = createAcpLiveRunStore({ manifest, roster });
  const storePath = join(dir, fileName);
  await writeAcpLiveRunStoreToFile(storePath, store, true);
  return storePath;
}

describe('live ingestion socket daemon cli lib', () => {
  it('parses socket path, repeated store inputs, and subscriber queue capacity', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-socket-cli-'));
    const firstStorePath = await writeStoreFixture(dir, 'store-a.json');
    const secondStorePath = await writeStoreFixture(dir, 'store-b.json');

    const parsed = parseLiveIngestionSocketCliArgs([
      '--socket',
      join(dir, 'live.sock'),
      '--store-input',
      firstStorePath,
      '--store-input',
      secondStorePath,
      '--subscriber-queue-capacity',
      '12',
    ]);
    expect(parsed.socketPath).toBe(join(dir, 'live.sock'));
    expect(parsed.storePaths).toEqual([firstStorePath, secondStorePath]);
    expect(parsed.subscriberQueueCapacity).toBe(12);
  });

  it('loads persisted stores, serves requests, and shuts down on signal', async () => {
    const manifest = readFixture<RunManifest>('run-manifest.live.c5.json');
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-socket-cli-'));
    const storePath = await writeStoreFixture(dir, 'store.json');
    const socketPath = join(dir, 'live.sock');
    const daemon = await startLiveIngestionSocketDaemon({
      socketPath,
      storePaths: [storePath],
      subscriberQueueCapacity: 64,
    });

    const response = await sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'get_store',
      request_id: 'req_store_daemon',
      run_id: manifest.runId,
      payload: {},
    });
    expect(response.type).toBe('get_store_ok');

    const signals = new EventEmitter();
    const stopping = waitForLiveIngestionSocketDaemonSignal(daemon, signals);
    signals.emit('SIGTERM');
    await stopping;

    await expect(sendOneShot(socketPath, {
      protocol_version: 1,
      type: 'get_store',
      request_id: 'req_store_after_stop',
      run_id: manifest.runId,
      payload: {},
    })).rejects.toThrow();
  });

  it('rejects duplicate run ids across loaded store files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-socket-cli-'));
    const firstStorePath = await writeStoreFixture(dir, 'store-a.json');
    const secondStorePath = await writeStoreFixture(dir, 'store-b.json');

    await expect(startLiveIngestionSocketDaemon({
      socketPath: join(dir, 'live.sock'),
      storePaths: [firstStorePath, secondStorePath],
      subscriberQueueCapacity: 64,
    })).rejects.toThrow('duplicate run_id');
  });
});
