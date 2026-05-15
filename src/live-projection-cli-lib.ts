import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  currentAcpLiveControlRoomProjection,
} from './acp-live-run-store.js';
import type { AcpIngressEnvelope, RosterEntry, RunManifest } from './schema.js';
import { validateRunManifest } from './validate.js';

export interface LiveProjectionCliOptions {
  manifestPath: string;
  rosterPath: string;
  ingressPath: string;
  outputPath: string;
  pretty: boolean;
}

export interface LiveProjectionCliResult {
  outputPath: string;
}

export function parseLiveProjectionCliArgs(args: readonly string[]): LiveProjectionCliOptions {
  let manifestPath: string | undefined;
  let rosterPath: string | undefined;
  let ingressPath: string | undefined;
  let outputPath: string | undefined;
  let pretty = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--manifest') {
      manifestPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--roster') {
      rosterPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--ingress') {
      ingressPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--output') {
      outputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!manifestPath) {
    throw new Error('missing required --manifest <run-manifest.json>');
  }

  if (!rosterPath) {
    throw new Error('missing required --roster <roster.json>');
  }

  if (!ingressPath) {
    throw new Error('missing required --ingress <acp-ingress.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <live-control-room.json>');
  }

  return {
    manifestPath: resolve(manifestPath),
    rosterPath: resolve(rosterPath),
    ingressPath: resolve(ingressPath),
    outputPath: resolve(outputPath),
    pretty,
  };
}

export async function writeLiveControlRoomProjectionFromFiles(
  options: LiveProjectionCliOptions,
): Promise<LiveProjectionCliResult> {
  const [rawManifest, rawRoster, rawIngress] = await Promise.all([
    readFile(options.manifestPath, 'utf8'),
    readFile(options.rosterPath, 'utf8'),
    readFile(options.ingressPath, 'utf8'),
  ]);

  const parsedManifest = JSON.parse(rawManifest) as unknown;
  const parsedRoster = JSON.parse(rawRoster) as unknown;
  const parsedIngress = JSON.parse(rawIngress) as unknown;

  const manifestErrors = validateRunManifest(parsedManifest);
  if (manifestErrors.length > 0) {
    throw new Error(`run manifest ${options.manifestPath} is invalid: ${manifestErrors.join('; ')}`);
  }

  if (!Array.isArray(parsedRoster)) {
    throw new Error(`roster ${options.rosterPath} must be a JSON array`);
  }

  if (!Array.isArray(parsedIngress)) {
    throw new Error(`ACP ingress ${options.ingressPath} must be a JSON array`);
  }

  const store = appendAcpIngressEnvelopesToRunStore(
    createAcpLiveRunStore({
      manifest: parsedManifest as RunManifest,
      roster: parsedRoster as RosterEntry[],
    }),
    parsedIngress as AcpIngressEnvelope[],
  );
  const projection = currentAcpLiveControlRoomProjection(store);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(projection, null, options.pretty ? 2 : undefined));
  return { outputPath: options.outputPath };
}

export function liveProjectionUsageText(): string {
  return 'Usage: agent-kumite-live-project --manifest <run-manifest.json> --roster <roster.json> --ingress <acp-ingress.json> --output <live-control-room.json> [--pretty]';
}
