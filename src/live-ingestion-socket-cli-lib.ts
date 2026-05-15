import { resolve } from 'node:path';

import { readAcpLiveRunStoreFromFile } from './acp-live-run-store-file.js';
import { LiveIngestionSocketServer } from './live-ingestion-socket.js';

const DEFAULT_STOP_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export interface LiveIngestionSocketCliOptions {
  socketPath: string;
  storePaths: readonly string[];
  subscriberQueueCapacity: number;
}

export interface LiveIngestionSocketDaemon {
  readonly socketPath: string;
  readonly server: LiveIngestionSocketServer;
  stop(): Promise<void>;
}

export interface LiveIngestionSocketSignalSource {
  once(event: NodeJS.Signals, listener: () => void): unknown;
  off(event: NodeJS.Signals, listener: () => void): unknown;
}

export function parseLiveIngestionSocketCliArgs(args: readonly string[]): LiveIngestionSocketCliOptions {
  let socketPath: string | undefined;
  const storePaths: string[] = [];
  let subscriberQueueCapacity = 64;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--socket') {
      socketPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--store-input') {
      const storePath = args[index + 1];
      if (!storePath) {
        throw new Error('missing required value for --store-input <live-run-store.json>');
      }
      storePaths.push(resolve(storePath));
      index += 1;
      continue;
    }

    if (arg === '--subscriber-queue-capacity') {
      subscriberQueueCapacity = parseSubscriberQueueCapacity(args[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!socketPath) {
    throw new Error('missing required --socket <live-ingestion.sock>');
  }

  if (storePaths.length === 0) {
    throw new Error('missing required --store-input <live-run-store.json>');
  }

  return {
    socketPath: resolve(socketPath),
    storePaths,
    subscriberQueueCapacity,
  };
}

function parseSubscriberQueueCapacity(value: string | undefined): number {
  if (!value) {
    throw new Error('missing required value for --subscriber-queue-capacity <count>');
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--subscriber-queue-capacity must be a non-negative integer');
  }

  return parsed;
}

export async function startLiveIngestionSocketDaemon(
  options: LiveIngestionSocketCliOptions,
): Promise<LiveIngestionSocketDaemon> {
  const stores = await Promise.all(options.storePaths.map((path) => readAcpLiveRunStoreFromFile(path)));
  const seenRunIds = new Set<string>();
  for (const store of stores) {
    if (seenRunIds.has(store.manifest.runId)) {
      throw new Error(`duplicate run_id ${store.manifest.runId} across --store-input files`);
    }
    seenRunIds.add(store.manifest.runId);
  }

  const server = new LiveIngestionSocketServer({
    socketPath: options.socketPath,
    initialStores: stores,
    subscriberQueueCapacity: options.subscriberQueueCapacity,
  });
  await server.start();

  return {
    socketPath: options.socketPath,
    server,
    stop: async () => server.stop(),
  };
}

export async function waitForLiveIngestionSocketDaemonSignal(
  daemon: LiveIngestionSocketDaemon,
  signalSource: LiveIngestionSocketSignalSource = process,
  signals: readonly NodeJS.Signals[] = DEFAULT_STOP_SIGNALS,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stopping = false;
    const listeners = new Map<NodeJS.Signals, () => void>();

    const cleanup = (): void => {
      for (const [signal, listener] of listeners) {
        signalSource.off(signal, listener);
      }
      listeners.clear();
    };

    const stopDaemon = (): void => {
      if (stopping) {
        return;
      }
      stopping = true;
      cleanup();
      void daemon.stop().then(resolve, reject);
    };

    for (const signal of signals) {
      const listener = (): void => stopDaemon();
      listeners.set(signal, listener);
      signalSource.once(signal, listener);
    }
  });
}

export function liveIngestionSocketUsageText(): string {
  return 'Usage: agent-kumite-live-socket --socket <live-ingestion.sock> --store-input <live-run-store.json> [--store-input <live-run-store.json> ...] [--subscriber-queue-capacity <count>]';
}
