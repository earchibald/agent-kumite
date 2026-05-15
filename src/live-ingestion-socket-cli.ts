#!/usr/bin/env node

import {
  liveIngestionSocketUsageText,
  parseLiveIngestionSocketCliArgs,
  startLiveIngestionSocketDaemon,
  waitForLiveIngestionSocketDaemonSignal,
} from './live-ingestion-socket-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseLiveIngestionSocketCliArgs(process.argv.slice(2));
    const daemon = await startLiveIngestionSocketDaemon(options);
    process.stdout.write(`${daemon.socketPath}\n`);
    await waitForLiveIngestionSocketDaemonSignal(daemon);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${liveIngestionSocketUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
