import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  serializeAcpLiveRunStore,
} from './acp-live-run-store.js';
import { readAcpLiveFileInputs } from './acp-live-file-input.js';

export interface LiveRunStoreCliOptions {
  manifestPath: string;
  rosterPath: string;
  ingressPath: string;
  outputPath: string;
  pretty: boolean;
}

export interface LiveRunStoreCliResult {
  outputPath: string;
}

export function parseLiveRunStoreCliArgs(args: readonly string[]): LiveRunStoreCliOptions {
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
    throw new Error('missing required --output <live-run-store.json>');
  }

  return {
    manifestPath: resolve(manifestPath),
    rosterPath: resolve(rosterPath),
    ingressPath: resolve(ingressPath),
    outputPath: resolve(outputPath),
    pretty,
  };
}

export async function writeAcpLiveRunStoreFromFiles(
  options: LiveRunStoreCliOptions,
): Promise<LiveRunStoreCliResult> {
  const inputs = await readAcpLiveFileInputs({
    manifestPath: options.manifestPath,
    rosterPath: options.rosterPath,
    ingressPath: options.ingressPath,
  });
  const store = appendAcpIngressEnvelopesToRunStore(
    createAcpLiveRunStore({
      manifest: inputs.manifest,
      roster: inputs.roster,
    }),
    inputs.ingress,
  );
  const serialized = serializeAcpLiveRunStore(store);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(serialized, null, options.pretty ? 2 : undefined));
  return { outputPath: options.outputPath };
}

export function liveRunStoreUsageText(): string {
  return 'Usage: agent-kumite-live-store --manifest <run-manifest.json> --roster <roster.json> --ingress <acp-ingress.json> --output <live-run-store.json> [--pretty]';
}
