#!/usr/bin/env node

import {
  parseRuntimeLiveStreamCliArgs,
  runtimeLiveStreamUsageText,
  streamDeterministicRuntimeToLiveSocketFromFile,
} from './runtime-live-stream-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseRuntimeLiveStreamCliArgs(process.argv.slice(2));
    const result = await streamDeterministicRuntimeToLiveSocketFromFile(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${runtimeLiveStreamUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
