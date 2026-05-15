#!/usr/bin/env node

import {
  parseRuntimeAcpIngressCliArgs,
  runtimeAcpIngressUsageText,
  writeRuntimeAcpIngressFromFile,
} from './runtime-acp-ingress-cli-lib.js';

async function main(): Promise<void> {
  try {
    const options = parseRuntimeAcpIngressCliArgs(process.argv.slice(2));
    const result = await writeRuntimeAcpIngressFromFile(options);
    process.stdout.write(`${result.outputPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${runtimeAcpIngressUsageText()}\n`);
    process.exitCode = 1;
  }
}

void main();
