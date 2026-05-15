import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  currentAcpLiveControlRoomProjection,
  type AcpLiveRunStore,
} from './acp-live-run-store.js';
import { readAcpLiveFileInputs } from './acp-live-file-input.js';
import { readAcpLiveRunStoreFromFile } from './acp-live-run-store-file.js';

export interface LiveProjectionCliOptions {
  manifestPath?: string;
  rosterPath?: string;
  ingressPath?: string;
  storeInputPath?: string;
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
  let storeInputPath: string | undefined;
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

    if (arg === '--store-input') {
      storeInputPath = args[index + 1];
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

  if (storeInputPath && (manifestPath || rosterPath || ingressPath)) {
    throw new Error('use either --store-input <live-run-store.json> or --manifest/--roster/--ingress, not both');
  }

  if (!storeInputPath && (!manifestPath || !rosterPath || !ingressPath)) {
    throw new Error('missing required live input: either --store-input <live-run-store.json> or --manifest <run-manifest.json> --roster <roster.json> --ingress <acp-ingress.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <live-control-room.json>');
  }

  return {
    ...(manifestPath ? { manifestPath: resolve(manifestPath) } : {}),
    ...(rosterPath ? { rosterPath: resolve(rosterPath) } : {}),
    ...(ingressPath ? { ingressPath: resolve(ingressPath) } : {}),
    ...(storeInputPath ? { storeInputPath: resolve(storeInputPath) } : {}),
    outputPath: resolve(outputPath),
    pretty,
  };
}

export async function writeLiveControlRoomProjectionFromFiles(
  options: LiveProjectionCliOptions,
): Promise<LiveProjectionCliResult> {
  let store: AcpLiveRunStore;
  if (options.storeInputPath) {
    store = await readAcpLiveRunStoreFromFile(options.storeInputPath);
  } else {
    const inputs = await readAcpLiveFileInputs({
      manifestPath: options.manifestPath!,
      rosterPath: options.rosterPath!,
      ingressPath: options.ingressPath!,
    });
    store = appendAcpIngressEnvelopesToRunStore(
      createAcpLiveRunStore({
        manifest: inputs.manifest,
        roster: inputs.roster,
      }),
      inputs.ingress,
    );
  }
  const projection = currentAcpLiveControlRoomProjection(store);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(projection, null, options.pretty ? 2 : undefined));
  return { outputPath: options.outputPath };
}

export function liveProjectionUsageText(): string {
  return 'Usage: agent-kumite-live-project (--store-input <live-run-store.json> | --manifest <run-manifest.json> --roster <roster.json> --ingress <acp-ingress.json>) --output <live-control-room.json> [--pretty]';
}
