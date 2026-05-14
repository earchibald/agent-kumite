import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { ArtifactBundle } from './schema.js';
import { createAftermathReport, renderAftermathReport } from './report.js';
import { validateArtifactBundle } from './validate.js';

export interface ReportCliOptions {
  inputPath: string;
  outputPath: string;
}

export function parseReportCliArgs(args: readonly string[]): ReportCliOptions {
  let inputPath: string | undefined;
  let outputPath: string | undefined;

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

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error('missing required --input <artifact-bundle.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <report.txt>');
  }

  return {
    inputPath: resolve(inputPath),
    outputPath: resolve(outputPath),
  };
}

export async function writeAftermathReportFromFile(options: ReportCliOptions): Promise<string> {
  const raw = await readFile(options.inputPath, 'utf8');
  const bundle = JSON.parse(raw) as ArtifactBundle;
  const errors = validateArtifactBundle(bundle);
  if (errors.length > 0) {
    throw new Error(`artifact bundle is invalid: ${errors.join('; ')}`);
  }

  const report = renderAftermathReport(createAftermathReport(bundle));
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, report);
  return report;
}

export function reportUsageText(): string {
  return 'Usage: agent-kumite-report --input <artifacts.json> --output <report.txt>';
}
