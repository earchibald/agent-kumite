#!/usr/bin/env node

import { batchUsageText, parseBatchCliArgs, writeBenchmarkBatchFromPlan } from './batch-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseBatchCliArgs(process.argv.slice(2));
    const result = await writeBenchmarkBatchFromPlan(options);
    process.stdout.write(`${result.batchLedgerPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${batchUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
