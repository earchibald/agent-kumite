#!/usr/bin/env node

import { parseReplayCliArgs, replayUsageText, writeReplayLabHelpersFromFile } from './replay-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseReplayCliArgs(process.argv.slice(2));
    const result = await writeReplayLabHelpersFromFile(options);
    process.stdout.write(`${result.outputPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${replayUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
