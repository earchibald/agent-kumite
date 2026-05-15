#!/usr/bin/env node

import {
  followLiveIngestionSocketSnapshots,
  liveIngestionSocketFollowUsageText,
  parseLiveIngestionSocketFollowCliArgs,
} from './live-ingestion-socket-follow-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseLiveIngestionSocketFollowCliArgs(process.argv.slice(2));
    const result = await followLiveIngestionSocketSnapshots(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${liveIngestionSocketFollowUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
