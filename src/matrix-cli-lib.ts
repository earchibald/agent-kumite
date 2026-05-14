import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createMatrixSummary, normalizeBenchmarkSummaryInput, renderMatrixSummary } from './matrix.js';
import { validateArtifactBundle } from './validate.js';

export interface MatrixCliOptions {
  inputPaths: string[];
  outputPath: string;
  reportOutputPath: string;
  pretty: boolean;
}

export interface MatrixCliResult {
  outputPath: string;
  reportOutputPath: string;
}

export function parseMatrixCliArgs(args: readonly string[]): MatrixCliOptions {
  const inputPaths: string[] = [];
  let outputPath: string | undefined;
  let reportOutputPath: string | undefined;
  let pretty = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--input') {
      const next = args[index + 1];
      if (!next) {
        throw new Error('missing path after --input');
      }
      inputPaths.push(resolve(next));
      index += 1;
      continue;
    }

    if (arg === '--output') {
      outputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--report-output') {
      reportOutputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (inputPaths.length === 0) {
    throw new Error('missing at least one --input <artifact-bundle.json|benchmark-summary.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <matrix-summary.json>');
  }

  if (!reportOutputPath) {
    throw new Error('missing required --report-output <matrix-report.txt>');
  }

  return {
    inputPaths,
    outputPath: resolve(outputPath),
    reportOutputPath: resolve(reportOutputPath),
    pretty,
  };
}

export async function writeMatrixSummaryFromFiles(options: MatrixCliOptions): Promise<MatrixCliResult> {
  const summaries = [];

  for (const inputPath of options.inputPaths) {
    const raw = await readFile(inputPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (parsed && typeof parsed === 'object' && 'manifest' in parsed && 'benchmarkSummary' in parsed) {
      const errors = validateArtifactBundle(parsed);
      if (errors.length > 0) {
        throw new Error(`artifact bundle ${inputPath} is invalid: ${errors.join('; ')}`);
      }
    }

    summaries.push(normalizeBenchmarkSummaryInput(parsed));
  }

  const matrixSummary = createMatrixSummary(summaries);
  const matrixReport = renderMatrixSummary(matrixSummary);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await mkdir(dirname(options.reportOutputPath), { recursive: true });
  await writeFile(options.outputPath, JSON.stringify(matrixSummary, null, options.pretty ? 2 : undefined));
  await writeFile(options.reportOutputPath, matrixReport);

  return {
    outputPath: options.outputPath,
    reportOutputPath: options.reportOutputPath,
  };
}

export function matrixUsageText(): string {
  return 'Usage: agent-kumite-matrix --input <artifact-or-summary.json> [--input ...] --output <matrix-summary.json> --report-output <matrix-report.txt> [--pretty]';
}
