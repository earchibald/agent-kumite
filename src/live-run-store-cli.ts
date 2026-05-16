#!/usr/bin/env node

import {
  liveRunStoreUsageText,
  parseLiveRunStoreCliArgs,
  writeAcpLiveRunStoreFromFiles,
} from './live-run-store-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseLiveRunStoreCliArgs(process.argv.slice(2));
    const result = await writeAcpLiveRunStoreFromFiles(options);
    process.stdout.write(`${result.outputPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${liveRunStoreUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
