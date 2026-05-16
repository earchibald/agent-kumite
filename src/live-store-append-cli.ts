#!/usr/bin/env node

import {
  appendAcpLiveRunStoreFromFiles,
  liveStoreAppendUsageText,
  parseLiveStoreAppendCliArgs,
} from './live-store-append-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseLiveStoreAppendCliArgs(process.argv.slice(2));
    const result = await appendAcpLiveRunStoreFromFiles(options);
    process.stdout.write(`${result.outputPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${liveStoreAppendUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
