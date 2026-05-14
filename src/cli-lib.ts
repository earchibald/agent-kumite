import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { runDeterministicMatch, type DeterministicRunnerInput, type DeterministicRunnerResult } from './runner.js';

export interface CliOptions {
  inputPath: string;
  outputPath: string;
  pretty: boolean;
}

export function parseCliArgs(args: readonly string[]): CliOptions {
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
    throw new Error('missing required --input <path>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <path>');
  }

  return {
    inputPath: resolve(inputPath),
    outputPath: resolve(outputPath),
    pretty,
  };
}

export async function runHarnessFromFile(options: CliOptions): Promise<DeterministicRunnerResult> {
  const raw = await readFile(options.inputPath, 'utf8');
  const input = JSON.parse(raw) as DeterministicRunnerInput;
  const result = runDeterministicMatch(input);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(
    options.outputPath,
    JSON.stringify(result.artifactBundle, null, options.pretty ? 2 : undefined),
  );

  return result;
}

export function usageText(): string {
  return 'Usage: agent-kumite-harness --input <match.json> --output <artifacts.json> [--pretty]';
}
