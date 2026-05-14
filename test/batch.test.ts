import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseBatchCliArgs,
  validateBenchmarkBatchPlan,
  writeBenchmarkBatchFromPlan,
} from '../src/index.ts';

function readFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('benchmark batch runner', () => {
  it('parses the benchmark batch CLI contract', () => {
    const parsed = parseBatchCliArgs(['--plan', 'fixtures/demo-batch.json', '--output-dir', 'out/batch', '--pretty']);

    expect(parsed.planPath.endsWith('fixtures/demo-batch.json')).toBe(true);
    expect(parsed.outputDir.endsWith('out/batch')).toBe(true);
    expect(parsed.pretty).toBe(true);
  });

  it('executes seed blocks, preserves consumed invalid runs, and emits matrix-ready outputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-batch-'));
    const fixturePath = join(dir, 'demo-match.input.json');
    const planPath = join(dir, 'benchmark-batch.plan.json');
    const outputDir = join(dir, 'out');

    await writeFile(fixturePath, readFixture('demo-match.input.json'));
    await writeFile(planPath, JSON.stringify({
      batchId: 'ak27_demo',
      seedLedger: [1, 2, 3],
      targetMatchedSeedCount: 2,
      conditions: [
        { condition: 'C1', inputPath: 'demo-match.input.json' },
        { condition: 'C2', inputPath: 'demo-match.input.json' },
        { condition: 'C3', inputPath: 'demo-match.input.json' },
        { condition: 'C4', inputPath: 'demo-match.input.json' },
        { condition: 'C5', inputPath: 'demo-match.input.json' },
      ],
      runOverrides: [
        { condition: 'C5', runSeed: 2, validityStatus: 'invalid', invalidationReason: 'operator contamination' },
      ],
    }, null, 2));

    expect(validateBenchmarkBatchPlan(JSON.parse(await readFile(planPath, 'utf8')))).toEqual([]);

    const result = await writeBenchmarkBatchFromPlan({
      planPath,
      outputDir,
      pretty: true,
    });

    const batchLedger = JSON.parse(await readFile(result.batchLedgerPath, 'utf8'));
    const matrixInputs = JSON.parse(await readFile(result.matrixInputsPath, 'utf8'));
    const matrixSummary = JSON.parse(await readFile(result.matrixSummaryPath, 'utf8'));
    const matrixReport = await readFile(result.matrixReportPath, 'utf8');

    expect(batchLedger.targetReached).toBe(true);
    expect(batchLedger.executedRunCount).toBe(15);
    expect(batchLedger.fullyMatchedSeeds).toEqual([1, 3]);
    expect(batchLedger.selectedSeeds).toEqual([1, 3]);
    expect(batchLedger.runs.find((run: { condition: string; runSeed: number }) => run.condition === 'C5' && run.runSeed === 2)?.validityStatus).toBe('invalid');
    expect(batchLedger.runs.filter((run: { selectedForMatrix: boolean }) => run.selectedForMatrix)).toHaveLength(10);
    expect(matrixInputs.selectedSeeds).toEqual([1, 3]);
    expect(matrixInputs.benchmarkSummaryPaths).toHaveLength(10);
    expect(matrixSummary.validRunCount).toBe(10);
    expect(matrixSummary.matchedSeedLedger.fullyMatchedSeeds).toEqual([1, 3]);
    expect(matrixReport).toContain('Runs: 10 valid / 10 total');
    expect(matrixReport).toContain('C5-C4 matched=2');
  });
});
