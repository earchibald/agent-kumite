#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { bundleUsageText, parseBundleCliArgs, runHarnessBundleFromFile } from './bundle-cli-lib.js';

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseBundleCliArgs(args);
    const result = await runHarnessBundleFromFile(options);
    process.stdout.write(
      `Wrote bundle outputs:\n- ${result.artifactPath}\n- ${result.reportPath}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n${bundleUsageText()}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath && import.meta.url === invokedPath) {
  await main();
}
