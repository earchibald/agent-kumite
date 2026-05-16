#!/usr/bin/env node

import { parseProjectionCliArgs, projectionUsageText, writeControlRoomProjectionFromFile } from './projection-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseProjectionCliArgs(process.argv.slice(2));
    const result = await writeControlRoomProjectionFromFile(options);
    process.stdout.write(`${result.outputPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${projectionUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
