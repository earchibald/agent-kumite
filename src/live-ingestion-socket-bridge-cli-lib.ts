import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import readline from 'node:readline';

import { appendIngressViaLiveSocket } from './live-ingestion-socket-client.js';
import type { AcpIngressEnvelope } from './schema.js';

export interface LiveIngestionSocketBridgeCliOptions {
  socketPath: string;
  runId: string;
  inputPath?: string;
  inputFormat: 'ndjson' | 'json-array';
  batchSize: number;
  requestIdPrefix: string;
}

export interface LiveIngestionSocketBridgeCliResult {
  appendedEnvelopeCount: number;
  batchesSent: number;
  requestIds: string[];
}

export function parseLiveIngestionSocketBridgeCliArgs(
  args: readonly string[],
): LiveIngestionSocketBridgeCliOptions {
  let socketPath: string | undefined;
  let runId: string | undefined;
  let inputPath: string | undefined;
  let inputFormat: 'ndjson' | 'json-array' = 'ndjson';
  let batchSize = 1;
  let requestIdPrefix: string | undefined;

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

    if (arg === '--input') {
      inputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--input-format') {
      const value = args[index + 1];
      if (value !== 'ndjson' && value !== 'json-array') {
        throw new Error('--input-format must be one of ndjson or json-array');
      }
      inputFormat = value;
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

  if (!socketPath) {
    throw new Error('missing required --socket <live-ingestion.sock>');
  }

  if (!runId) {
    throw new Error('missing required --run-id <run-id>');
  }

  return {
    socketPath: resolve(socketPath),
    runId,
    ...(inputPath ? { inputPath: resolve(inputPath) } : {}),
    inputFormat,
    batchSize,
    requestIdPrefix: requestIdPrefix ?? `bridge_${runId}`,
  };
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function assertEnvelopeRunId(envelope: AcpIngressEnvelope, runId: string): void {
  if (envelope.runId !== runId) {
    throw new Error(`ACP ingress envelope runId ${envelope.runId} does not match --run-id ${runId}`);
  }
}

async function appendBatch(
  envelopes: readonly AcpIngressEnvelope[],
  options: LiveIngestionSocketBridgeCliOptions,
  sequence: number,
  requestIds: string[],
): Promise<void> {
  if (envelopes.length === 0) {
    return;
  }

  const requestId = `${options.requestIdPrefix}_${String(sequence).padStart(6, '0')}`;
  requestIds.push(requestId);
  await appendIngressViaLiveSocket({
    socketPath: options.socketPath,
    runId: options.runId,
    requestId,
    envelopes,
  });
}

async function bridgeNdjsonIngress(
  input: NodeJS.ReadableStream,
  options: LiveIngestionSocketBridgeCliOptions,
): Promise<LiveIngestionSocketBridgeCliResult> {
  const lineReader = readline.createInterface({
    input: input as NodeJS.ReadableStream,
    crlfDelay: Infinity,
  });
  const batch: AcpIngressEnvelope[] = [];
  const requestIds: string[] = [];
  let appendedEnvelopeCount = 0;
  let sequence = 0;

  for await (const line of lineReader) {
    if (line.trim().length === 0) {
      continue;
    }
    const envelope = JSON.parse(line) as AcpIngressEnvelope;
    assertEnvelopeRunId(envelope, options.runId);
    batch.push(envelope);
    appendedEnvelopeCount += 1;

    if (batch.length >= options.batchSize) {
      await appendBatch(batch.splice(0, batch.length), options, sequence, requestIds);
      sequence += 1;
    }
  }

  if (batch.length > 0) {
    await appendBatch(batch, options, sequence, requestIds);
  }

  return {
    appendedEnvelopeCount,
    batchesSent: requestIds.length,
    requestIds,
  };
}

async function readWholeStream(input: NodeJS.ReadableStream): Promise<string> {
  let data = '';
  for await (const chunk of input) {
    data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  }
  return data;
}

async function bridgeJsonArrayIngress(
  input: NodeJS.ReadableStream,
  options: LiveIngestionSocketBridgeCliOptions,
): Promise<LiveIngestionSocketBridgeCliResult> {
  const raw = await readWholeStream(input);
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('json-array input must be a JSON array of ACP ingress envelopes');
  }

  const envelopes = parsed as AcpIngressEnvelope[];
  for (const envelope of envelopes) {
    assertEnvelopeRunId(envelope, options.runId);
  }

  const requestIds: string[] = [];
  let sequence = 0;
  for (let index = 0; index < envelopes.length; index += options.batchSize) {
    await appendBatch(envelopes.slice(index, index + options.batchSize), options, sequence, requestIds);
    sequence += 1;
  }

  return {
    appendedEnvelopeCount: envelopes.length,
    batchesSent: requestIds.length,
    requestIds,
  };
}

export async function bridgeAcpIngressToLiveSocket(
  options: LiveIngestionSocketBridgeCliOptions,
  input: NodeJS.ReadableStream,
): Promise<LiveIngestionSocketBridgeCliResult> {
  if (options.inputFormat === 'json-array') {
    return bridgeJsonArrayIngress(input, options);
  }
  return bridgeNdjsonIngress(input, options);
}

export async function bridgeAcpIngressFileToLiveSocket(
  options: LiveIngestionSocketBridgeCliOptions,
): Promise<LiveIngestionSocketBridgeCliResult> {
  const input = options.inputPath ? createReadStream(options.inputPath, 'utf8') : process.stdin;
  return bridgeAcpIngressToLiveSocket(options, input);
}

export function liveIngestionSocketBridgeUsageText(): string {
  return 'Usage: agent-kumite-live-bridge --socket <live-ingestion.sock> --run-id <run-id> [--input <acp-ingress.ndjson|json>] [--input-format <ndjson|json-array>] [--batch-size <count>] [--request-id-prefix <prefix>]';
}
