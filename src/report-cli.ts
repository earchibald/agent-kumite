#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { parseReportCliArgs, reportUsageText, writeAftermathReportFromFile } from './report-cli-lib.js';

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseReportCliArgs(args);
    await writeAftermathReportFromFile(options);
    process.stdout.write(`Wrote aftermath report to ${options.outputPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n${reportUsageText()}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath && import.meta.url === invokedPath) {
  await main();
}
