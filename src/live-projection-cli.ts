#!/usr/bin/env node

import {
  liveProjectionUsageText,
  parseLiveProjectionCliArgs,
  writeLiveControlRoomProjectionFromFiles,
} from './live-projection-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseLiveProjectionCliArgs(process.argv.slice(2));
    const result = await writeLiveControlRoomProjectionFromFiles(options);
    process.stdout.write(`${result.outputPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${liveProjectionUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
