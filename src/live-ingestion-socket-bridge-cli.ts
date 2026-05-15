#!/usr/bin/env node

import {
  bridgeAcpIngressFileToLiveSocket,
  liveIngestionSocketBridgeUsageText,
  parseLiveIngestionSocketBridgeCliArgs,
} from './live-ingestion-socket-bridge-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseLiveIngestionSocketBridgeCliArgs(process.argv.slice(2));
    const result = await bridgeAcpIngressFileToLiveSocket(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${liveIngestionSocketBridgeUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
