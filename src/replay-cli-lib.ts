import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createReplaySnapshotDiff, findReplayMarkerJump, normalizeControlRoomProjectionInput, parseReplayCursor } from './replay.js';

export interface ReplayCliOptions {
  inputPath: string;
  outputPath: string;
  markerId?: string;
  fromCursor?: string;
  toCursor?: string;
  pretty: boolean;
}

export interface ReplayCliResult {
  outputPath: string;
}

export function parseReplayCliArgs(args: readonly string[]): ReplayCliOptions {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let markerId: string | undefined;
  let fromCursor: string | undefined;
  let toCursor: string | undefined;
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

    if (arg === '--output') {
      outputPath = args[index + 1];
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

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error('missing required --input <control-room.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <replay-lab.json>');
  }

  return {
    inputPath: resolve(inputPath),
    outputPath: resolve(outputPath),
    ...(markerId ? { markerId } : {}),
    ...(fromCursor ? { fromCursor } : {}),
    ...(toCursor ? { toCursor } : {}),
    pretty,
  };
}

export async function writeReplayLabHelpersFromFile(options: ReplayCliOptions): Promise<ReplayCliResult> {
  const raw = await readFile(options.inputPath, 'utf8');
  const parsed = normalizeControlRoomProjectionInput(JSON.parse(raw) as unknown);
  const markerJumps = parsed.replay.markers.map((marker) => findReplayMarkerJump(parsed, marker.markerId));
  const snapshotDiff = createReplaySnapshotDiff(
    parsed,
    options.fromCursor ? parseReplayCursor(options.fromCursor) : undefined,
    options.toCursor ? parseReplayCursor(options.toCursor) : undefined,
  );

  const payload = {
    runId: parsed.manifest.runId,
    matchId: parsed.manifest.matchId,
    markerJumps,
    ...(options.markerId ? { selectedMarkerJump: findReplayMarkerJump(parsed, options.markerId) } : {}),
    snapshotDiff,
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(payload, null, options.pretty ? 2 : undefined));
  return { outputPath: options.outputPath };
}

export function replayUsageText(): string {
  return 'Usage: agent-kumite-replay --input <control-room.json> --output <replay-lab.json> [--marker <marker-id>] [--from <round:phase>] [--to <round:phase>] [--pretty]';
}
