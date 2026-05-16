import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createControlRoomProjection } from './projection.js';
import type { ArtifactBundle } from './schema.js';
import { validateArtifactBundle } from './validate.js';

export interface ProjectionCliOptions {
  inputPath: string;
  outputPath: string;
  pretty: boolean;
}

export interface ProjectionCliResult {
  outputPath: string;
}

export function parseProjectionCliArgs(args: readonly string[]): ProjectionCliOptions {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
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

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error('missing required --input <artifact-bundle.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <control-room.json>');
  }

  return {
    inputPath: resolve(inputPath),
    outputPath: resolve(outputPath),
    pretty,
  };
}

export async function writeControlRoomProjectionFromFile(
  options: ProjectionCliOptions,
): Promise<ProjectionCliResult> {
  const raw = await readFile(options.inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const errors = validateArtifactBundle(parsed);
  if (errors.length > 0) {
    throw new Error(`artifact bundle ${options.inputPath} is invalid: ${errors.join('; ')}`);
  }

  const projection = createControlRoomProjection(parsed as ArtifactBundle);
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(projection, null, options.pretty ? 2 : undefined));
  return { outputPath: options.outputPath };
}

export function projectionUsageText(): string {
  return 'Usage: agent-kumite-project --input <artifact-bundle.json> --output <control-room.json> [--pretty]';
}
