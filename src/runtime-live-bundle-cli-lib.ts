import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { createAcpLiveRunStore } from './acp-live-run-store.js';
import { writeAcpLiveRunStoreToFile } from './acp-live-run-store-file.js';
import { startLiveIngestionSocketDaemon } from './live-ingestion-socket-cli-lib.js';
import { followLiveIngestionSocketSnapshots } from './live-ingestion-socket-follow-cli-lib.js';
import { writeReplayLabHelpersFromFile } from './replay-cli-lib.js';
import { exportRuntimeAcpIngress } from './runtime-acp-ingress-cli-lib.js';
import { streamDeterministicRuntimeToLiveSocket } from './runtime-live-stream-cli-lib.js';
import type { DeterministicRunnerInput } from './runner.js';

export interface RuntimeLiveBundleCliOptions {
  inputPath: string;
  storeOutputPath: string;
  projectionOutputPath: string;
  replayOutputPath?: string;
  markerId?: string;
  fromCursor?: string;
  toCursor?: string;
  socketPath?: string;
  batchSize: number;
  requestIdPrefix: string;
  pretty: boolean;
}

export interface RuntimeLiveBundleCliResult {
  storeOutputPath: string;
  projectionOutputPath: string;
  replayOutputPath?: string;
  socketPath: string;
  appendedEnvelopeCount: number;
  batchesSent: number;
}

export function parseRuntimeLiveBundleCliArgs(args: readonly string[]): RuntimeLiveBundleCliOptions {
  let inputPath: string | undefined;
  let storeOutputPath: string | undefined;
  let projectionOutputPath: string | undefined;
  let replayOutputPath: string | undefined;
  let markerId: string | undefined;
  let fromCursor: string | undefined;
  let toCursor: string | undefined;
  let socketPath: string | undefined;
  let batchSize = 1;
  let requestIdPrefix = 'runtime_bundle';
  let pretty = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--input') {
      inputPath = args[index + 1];
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

    if (arg === '--socket') {
      socketPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--replay-output') {
      replayOutputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--marker') {
      markerId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--from') {
      fromCursor = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--to') {
      toCursor = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--batch-size') {
      batchSize = parsePositiveInteger(args[index + 1], '--batch-size');
      index += 1;
      continue;
    }

    if (arg === '--request-id-prefix') {
      requestIdPrefix = args[index + 1] ?? requestIdPrefix;
      index += 1;
      continue;
    }

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error('missing required --input <match.json>');
  }
  if (!storeOutputPath) {
    throw new Error('missing required --store-output <live-run-store.json>');
  }
  if (!projectionOutputPath) {
    throw new Error('missing required --projection-output <live-control-room.json>');
  }
  if (!replayOutputPath && (markerId || fromCursor || toCursor)) {
    throw new Error('--marker, --from, and --to require --replay-output <replay-lab.json>');
  }

  return {
    inputPath: resolve(inputPath),
    storeOutputPath: resolve(storeOutputPath),
    projectionOutputPath: resolve(projectionOutputPath),
    ...(replayOutputPath ? { replayOutputPath: resolve(replayOutputPath) } : {}),
    ...(markerId ? { markerId } : {}),
    ...(fromCursor ? { fromCursor } : {}),
    ...(toCursor ? { toCursor } : {}),
    ...(socketPath ? { socketPath: resolve(socketPath) } : {}),
    batchSize,
    requestIdPrefix,
    pretty,
  };
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export async function runBundledRuntimeLiveFlow(
  input: DeterministicRunnerInput,
  options: Omit<RuntimeLiveBundleCliOptions, 'inputPath'>,
): Promise<RuntimeLiveBundleCliResult> {
  const envelopes = exportRuntimeAcpIngress(input);
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-kumite-live-bundle-'));
  const socketPath = options.socketPath ?? join(tempDir, 'live.sock');
  const seedStorePath = join(tempDir, 'seed-store.json');
  const seedStore = createAcpLiveRunStore({
    manifest: input.manifest,
    roster: input.roster,
  });
  await writeAcpLiveRunStoreToFile(seedStorePath, seedStore, options.pretty);

  const daemon = await startLiveIngestionSocketDaemon({
    socketPath,
    storePaths: [seedStorePath],
    subscriberQueueCapacity: 64,
  });

  try {
    const followPromise = followLiveIngestionSocketSnapshots({
      socketPath,
      runId: input.manifest.runId,
      storeOutputPath: options.storeOutputPath,
      projectionOutputPath: options.projectionOutputPath,
      pretty: options.pretty,
      reconnectDelayMs: 10,
      maxReconnects: 0,
      snapshotLimit: 1 + Math.ceil(envelopes.length / options.batchSize),
    });
    const streamResult = await streamDeterministicRuntimeToLiveSocket(input, {
      socketPath,
      runId: input.manifest.runId,
      batchSize: options.batchSize,
      requestIdPrefix: options.requestIdPrefix,
    });
    await followPromise;
    if (options.replayOutputPath) {
      await writeReplayLabHelpersFromFile({
        inputPath: options.projectionOutputPath,
        outputPath: options.replayOutputPath,
        ...(options.markerId ? { markerId: options.markerId } : {}),
        ...(options.fromCursor ? { fromCursor: options.fromCursor } : {}),
        ...(options.toCursor ? { toCursor: options.toCursor } : {}),
        pretty: options.pretty,
      });
    }

    return {
      storeOutputPath: options.storeOutputPath,
      projectionOutputPath: options.projectionOutputPath,
      ...(options.replayOutputPath ? { replayOutputPath: options.replayOutputPath } : {}),
      socketPath,
      appendedEnvelopeCount: streamResult.appendedEnvelopeCount,
      batchesSent: streamResult.batchesSent,
    };
  } finally {
    await daemon.stop();
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runBundledRuntimeLiveFlowFromFile(
  options: RuntimeLiveBundleCliOptions,
): Promise<RuntimeLiveBundleCliResult> {
  const raw = await readFile(options.inputPath, 'utf8');
  const input = JSON.parse(raw) as DeterministicRunnerInput;
  const bundledOptions: Omit<RuntimeLiveBundleCliOptions, 'inputPath'> = {
    storeOutputPath: options.storeOutputPath,
    projectionOutputPath: options.projectionOutputPath,
    ...(options.replayOutputPath ? { replayOutputPath: options.replayOutputPath } : {}),
    ...(options.markerId ? { markerId: options.markerId } : {}),
    ...(options.fromCursor ? { fromCursor: options.fromCursor } : {}),
    ...(options.toCursor ? { toCursor: options.toCursor } : {}),
    batchSize: options.batchSize,
    requestIdPrefix: options.requestIdPrefix,
    pretty: options.pretty,
    ...(options.socketPath ? { socketPath: options.socketPath } : {}),
  };
  return runBundledRuntimeLiveFlow(input, bundledOptions);
}

export function runtimeLiveBundleUsageText(): string {
  return 'Usage: agent-kumite-live-bundle --input <match.json> --store-output <live-run-store.json> --projection-output <live-control-room.json> [--replay-output <replay-lab.json> --marker <marker-id> --from <round:phase> --to <round:phase>] [--socket <live-ingestion.sock>] [--batch-size <count>] [--request-id-prefix <prefix>] [--pretty]';
}
