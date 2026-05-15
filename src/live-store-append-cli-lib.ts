import { resolve } from 'node:path';

import { readAcpIngressEnvelopeListFromFile } from './acp-ingress-file.js';
import { appendAcpIngressEnvelopesToRunStore } from './acp-live-run-store.js';
import { readAcpLiveRunStoreFromFile, writeAcpLiveRunStoreToFile } from './acp-live-run-store-file.js';

export interface LiveStoreAppendCliOptions {
  storeInputPath: string;
  ingressPath: string;
  outputPath: string;
  pretty: boolean;
}

export interface LiveStoreAppendCliResult {
  outputPath: string;
}

export function parseLiveStoreAppendCliArgs(args: readonly string[]): LiveStoreAppendCliOptions {
  let storeInputPath: string | undefined;
  let ingressPath: string | undefined;
  let outputPath: string | undefined;
  let pretty = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--store-input') {
      storeInputPath = args[index + 1];
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

  if (!storeInputPath) {
    throw new Error('missing required --store-input <live-run-store.json>');
  }

  if (!ingressPath) {
    throw new Error('missing required --ingress <acp-ingress.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <live-run-store.json>');
  }

  return {
    storeInputPath: resolve(storeInputPath),
    ingressPath: resolve(ingressPath),
    outputPath: resolve(outputPath),
    pretty,
  };
}

export async function appendAcpLiveRunStoreFromFiles(
  options: LiveStoreAppendCliOptions,
): Promise<LiveStoreAppendCliResult> {
  const [store, ingress] = await Promise.all([
    readAcpLiveRunStoreFromFile(options.storeInputPath),
    readAcpIngressEnvelopeListFromFile(options.ingressPath),
  ]);
  const updatedStore = appendAcpIngressEnvelopesToRunStore(store, ingress);
  const outputPath = await writeAcpLiveRunStoreToFile(options.outputPath, updatedStore, options.pretty);
  return { outputPath };
}

export function liveStoreAppendUsageText(): string {
  return 'Usage: agent-kumite-live-append --store-input <live-run-store.json> --ingress <acp-ingress.json> --output <live-run-store.json> [--pretty]';
}
