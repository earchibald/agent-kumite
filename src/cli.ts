#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { parseCliArgs, runHarnessFromFile, usageText } from './cli-lib.js';

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseCliArgs(args);
    const result = await runHarnessFromFile(options);
    process.stdout.write(
      `Wrote canonical artifact bundle for ${result.artifactBundle.manifest.runId} to ${options.outputPath}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n${usageText()}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath && import.meta.url === invokedPath) {
  await main();
}
