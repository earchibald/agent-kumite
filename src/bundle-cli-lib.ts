import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { runHarnessFromFile } from './cli-lib.js';
import { writeAftermathReportFromFile } from './report-cli-lib.js';

export interface BundleCliOptions {
  inputPath: string;
  outputDir: string;
  pretty: boolean;
}

export interface BundleRunResult {
  artifactPath: string;
  reportPath: string;
  benchmarkSummaryPath: string;
}

export function parseBundleCliArgs(args: readonly string[]): BundleCliOptions {
  let inputPath: string | undefined;
  let outputDir: string | undefined;
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

    if (arg === '--output-dir') {
      outputDir = args[index + 1];
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

  if (!outputDir) {
    throw new Error('missing required --output-dir <dir>');
  }

  return {
    inputPath: resolve(inputPath),
    outputDir: resolve(outputDir),
    pretty,
  };
}

export async function runHarnessBundleFromFile(options: BundleCliOptions): Promise<BundleRunResult> {
  const artifactPath = join(options.outputDir, 'artifact-bundle.json');
  const reportPath = join(options.outputDir, 'aftermath.txt');
  const benchmarkSummaryPath = join(options.outputDir, 'benchmark-summary.json');

  const result = await runHarnessFromFile({
    inputPath: options.inputPath,
    outputPath: artifactPath,
    pretty: options.pretty,
  });

  await writeAftermathReportFromFile({
    inputPath: artifactPath,
    outputPath: reportPath,
  });

  await mkdir(options.outputDir, { recursive: true });
  await writeFile(
    benchmarkSummaryPath,
    JSON.stringify(result.artifactBundle.benchmarkSummary, null, options.pretty ? 2 : undefined),
  );

  return { artifactPath, reportPath, benchmarkSummaryPath };
}

export function bundleUsageText(): string {
  return 'Usage: agent-kumite-bundle --input <match.json> --output-dir <dir> [--pretty]';
}
