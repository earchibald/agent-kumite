#!/usr/bin/env node

import {
  parseRuntimeLiveBundleCliArgs,
  runBundledRuntimeLiveFlowFromFile,
  runtimeLiveBundleUsageText,
} from './runtime-live-bundle-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseRuntimeLiveBundleCliArgs(process.argv.slice(2));
    const result = await runBundledRuntimeLiveFlowFromFile(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${runtimeLiveBundleUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
