#!/usr/bin/env node

import {
  liveSocketInspectUsageText,
  parseLiveSocketInspectCliArgs,
  runLiveSocketInspectCommand,
} from './live-ingestion-socket-inspect-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseLiveSocketInspectCliArgs(process.argv.slice(2));
    await runLiveSocketInspectCommand(options, (chunk) => process.stdout.write(chunk));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${liveSocketInspectUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
