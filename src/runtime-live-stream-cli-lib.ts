import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

import { bridgeAcpIngressToLiveSocket } from './live-ingestion-socket-bridge-cli-lib.js';
import { exportRuntimeAcpIngress } from './runtime-acp-ingress-cli-lib.js';
import type { DeterministicRunnerInput } from './runner.js';

export interface RuntimeLiveStreamCliOptions {
  inputPath: string;
  socketPath: string;
  runId: string;
  batchSize: number;
  requestIdPrefix: string;
}

export interface RuntimeLiveStreamCliResult {
  appendedEnvelopeCount: number;
  batchesSent: number;
  requestIds: string[];
}

export function parseRuntimeLiveStreamCliArgs(args: readonly string[]): RuntimeLiveStreamCliOptions {
  let inputPath: string | undefined;
  let socketPath: string | undefined;
  let runId: string | undefined;
  let batchSize = 1;
  let requestIdPrefix: string | undefined;

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

    if (arg === '--batch-size') {
      batchSize = parsePositiveInteger(args[index + 1], '--batch-size');
      index += 1;
      continue;
    }

    if (arg === '--request-id-prefix') {
      requestIdPrefix = args[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error('missing required --input <match.json>');
  }

  if (!socketPath) {
    throw new Error('missing required --socket <live-ingestion.sock>');
  }

  if (!runId) {
    throw new Error('missing required --run-id <run-id>');
  }

  return {
    inputPath: resolve(inputPath),
    socketPath: resolve(socketPath),
    runId,
    batchSize,
    requestIdPrefix: requestIdPrefix ?? `runtime_stream_${runId}`,
  };
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export async function streamDeterministicRuntimeToLiveSocket(
  input: DeterministicRunnerInput,
  options: Omit<RuntimeLiveStreamCliOptions, 'inputPath'>,
): Promise<RuntimeLiveStreamCliResult> {
  if (input.manifest.runId !== options.runId) {
    throw new Error(`deterministic input manifest.runId ${input.manifest.runId} does not match --run-id ${options.runId}`);
  }

  const envelopes = exportRuntimeAcpIngress(input);
  return bridgeAcpIngressToLiveSocket({
    socketPath: options.socketPath,
    runId: options.runId,
    inputFormat: 'json-array',
    batchSize: options.batchSize,
    requestIdPrefix: options.requestIdPrefix,
  }, Readable.from(JSON.stringify(envelopes)));
}

export async function streamDeterministicRuntimeToLiveSocketFromFile(
  options: RuntimeLiveStreamCliOptions,
): Promise<RuntimeLiveStreamCliResult> {
  const raw = await readFile(options.inputPath, 'utf8');
  const input = JSON.parse(raw) as DeterministicRunnerInput;
  return streamDeterministicRuntimeToLiveSocket(input, {
    socketPath: options.socketPath,
    runId: options.runId,
    batchSize: options.batchSize,
    requestIdPrefix: options.requestIdPrefix,
  });
}

export function runtimeLiveStreamUsageText(): string {
  return 'Usage: agent-kumite-live-stream-runtime --input <match.json> --socket <live-ingestion.sock> --run-id <run-id> [--batch-size <count>] [--request-id-prefix <prefix>]';
}
