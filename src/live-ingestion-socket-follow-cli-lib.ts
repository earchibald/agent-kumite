import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  currentAcpLiveControlRoomProjection,
  hydrateAcpLiveRunStore,
} from './acp-live-run-store.js';
import { writeAcpLiveRunStoreToFile } from './acp-live-run-store-file.js';
import {
  getLiveRunStoreViaSocket,
  subscribeToLiveRun,
  type LiveIngestionSocketProtocolError,
} from './live-ingestion-socket-client.js';
import { writeLiveControlRoomProjectionToFile } from './live-projection-file.js';
import type { PersistedAcpLiveRunStore } from './schema.js';

export interface LiveIngestionSocketFollowCliOptions {
  socketPath: string;
  runId: string;
  storeOutputPath?: string;
  projectionOutputPath?: string;
  pretty: boolean;
  reconnectDelayMs: number;
  maxReconnects: number;
  snapshotLimit?: number;
}

export interface LiveIngestionSocketFollowCliResult {
  storeOutputPath?: string;
  projectionOutputPath?: string;
  mirroredSnapshotCount: number;
  reconnectCount: number;
  terminationReason: 'snapshot_limit_reached' | 'server_stopping' | 'reconnect_exhausted';
}

export function parseLiveIngestionSocketFollowCliArgs(
  args: readonly string[],
): LiveIngestionSocketFollowCliOptions {
  let socketPath: string | undefined;
  let runId: string | undefined;
  let storeOutputPath: string | undefined;
  let projectionOutputPath: string | undefined;
  let pretty = false;
  let reconnectDelayMs = 250;
  let maxReconnects = 0;
  let snapshotLimit: number | undefined;

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

    if (arg === '--run-id') {
      runId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--store-output') {
      storeOutputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--projection-output') {
      projectionOutputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--reconnect-delay-ms') {
      reconnectDelayMs = parseNonNegativeInteger(args[index + 1], '--reconnect-delay-ms');
      index += 1;
      continue;
    }

    if (arg === '--max-reconnects') {
      maxReconnects = parseNonNegativeInteger(args[index + 1], '--max-reconnects');
      index += 1;
      continue;
    }

    if (arg === '--snapshot-limit') {
      snapshotLimit = parsePositiveInteger(args[index + 1], '--snapshot-limit');
      index += 1;
      continue;
    }

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!socketPath) {
    throw new Error('missing required --socket <live-ingestion.sock>');
  }

  if (!runId) {
    throw new Error('missing required --run-id <run-id>');
  }

  if (!storeOutputPath && !projectionOutputPath) {
    throw new Error('missing required output: use --store-output <live-run-store.json>, --projection-output <live-control-room.json>, or both');
  }

  return {
    socketPath: resolve(socketPath),
    runId,
    ...(storeOutputPath ? { storeOutputPath: resolve(storeOutputPath) } : {}),
    ...(projectionOutputPath ? { projectionOutputPath: resolve(projectionOutputPath) } : {}),
    pretty,
    reconnectDelayMs,
    maxReconnects,
    ...(snapshotLimit ? { snapshotLimit } : {}),
  };
}

function parseNonNegativeInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

async function mirrorSnapshot(
  store: PersistedAcpLiveRunStore,
  options: LiveIngestionSocketFollowCliOptions,
): Promise<void> {
  const hydrated = hydrateAcpLiveRunStore(store);
  if (options.storeOutputPath) {
    await writeAcpLiveRunStoreToFile(options.storeOutputPath, hydrated, options.pretty);
  }
  if (options.projectionOutputPath) {
    await writeLiveControlRoomProjectionToFile(
      options.projectionOutputPath,
      currentAcpLiveControlRoomProjection(hydrated),
      options.pretty,
    );
  }
}

function shouldReconnect(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }
  const maybeProtocol = error as LiveIngestionSocketProtocolError;
  if ('response' in maybeProtocol) {
    return maybeProtocol.response.payload.retryable;
  }
  return true;
}

export async function followLiveIngestionSocketSnapshots(
  options: LiveIngestionSocketFollowCliOptions,
): Promise<LiveIngestionSocketFollowCliResult> {
  let reconnectCount = 0;
  let mirroredSnapshotCount = 0;

  const maybeFinish = (
    terminationReason: LiveIngestionSocketFollowCliResult['terminationReason'],
  ): LiveIngestionSocketFollowCliResult => ({
    ...(options.storeOutputPath ? { storeOutputPath: options.storeOutputPath } : {}),
    ...(options.projectionOutputPath ? { projectionOutputPath: options.projectionOutputPath } : {}),
    mirroredSnapshotCount,
    reconnectCount,
    terminationReason,
  });

  while (true) {
    try {
      const subscription = await subscribeToLiveRun({
        socketPath: options.socketPath,
        runId: options.runId,
        events: ['store_updated', 'server_stopping'],
        initialSnapshot: 'store',
      });

      try {
        while (true) {
          const message = await subscription.nextMessage();
          if (message.type === 'subscribed') {
            continue;
          }

          if (message.type === 'store_snapshot') {
            await mirrorSnapshot(message.payload.store as PersistedAcpLiveRunStore, options);
            mirroredSnapshotCount += 1;
          } else if (message.type === 'store_updated') {
            const store = await getLiveRunStoreViaSocket({
              socketPath: options.socketPath,
              runId: options.runId,
            });
            await mirrorSnapshot(store, options);
            mirroredSnapshotCount += 1;
          } else if (message.type === 'server_stopping') {
            subscription.close();
            if (reconnectCount >= options.maxReconnects) {
              return maybeFinish('server_stopping');
            }
            reconnectCount += 1;
            await delay(options.reconnectDelayMs);
            break;
          }

          if (options.snapshotLimit !== undefined && mirroredSnapshotCount >= options.snapshotLimit) {
            subscription.close();
            return maybeFinish('snapshot_limit_reached');
          }
        }
      } finally {
        subscription.close();
      }
    } catch (error) {
      if (!shouldReconnect(error) || reconnectCount >= options.maxReconnects) {
        if (reconnectCount >= options.maxReconnects) {
          return maybeFinish('reconnect_exhausted');
        }
        throw error;
      }
      reconnectCount += 1;
      await delay(options.reconnectDelayMs);
    }
  }
}

export function liveIngestionSocketFollowUsageText(): string {
  return 'Usage: agent-kumite-live-follow --socket <live-ingestion.sock> --run-id <run-id> (--store-output <live-run-store.json> | --projection-output <live-control-room.json> | both) [--pretty] [--reconnect-delay-ms <ms>] [--max-reconnects <count>] [--snapshot-limit <count>]';
}
