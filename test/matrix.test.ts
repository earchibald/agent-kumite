import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createMatrixSummary,
  normalizeBenchmarkSummaryInput,
  renderMatrixSummary,
  type ArtifactBundle,
  type BenchmarkSummary,
  writeMatrixSummaryFromFiles,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function makeSummary(
  base: BenchmarkSummary,
  overrides: Partial<BenchmarkSummary>,
): BenchmarkSummary {
  return {
    ...base,
    ...overrides,
    winnerIds: overrides.winnerIds ? [...overrides.winnerIds] : [...base.winnerIds],
    eliminatedAgentIds: overrides.eliminatedAgentIds ? [...overrides.eliminatedAgentIds] : [...base.eliminatedAgentIds],
    totals: {
      ...base.totals,
      ...(overrides.totals ?? {}),
    },
    replayMarkersByType: {
      ...base.replayMarkersByType,
      ...(overrides.replayMarkersByType ?? {}),
    },
    divergenceByOutcome: {
      ...base.divergenceByOutcome,
      ...(overrides.divergenceByOutcome ?? {}),
    },
    highlightLabels: overrides.highlightLabels ? [...overrides.highlightLabels] : [...base.highlightLabels],
  };
}

describe('matched-seed matrix summaries', () => {
  const artifactFixture = readFixture<ArtifactBundle>('artifact-bundle.minimal.c5.json');
  const baseSummary = artifactFixture.benchmarkSummary;

  it('builds condition-grouped summaries and matched-seed deltas from benchmark summaries', () => {
    const summary = createMatrixSummary([
      makeSummary(baseSummary, { condition: 'C4', runId: 'run_c4_seed_0001', runSeed: 1, winnerIds: ['agent-alpha'] }),
      makeSummary(baseSummary, {
        condition: 'C5',
        runId: 'run_c5_seed_0001',
        runSeed: 1,
        winnerIds: ['agent-saboteur'],
        totals: { ...baseSummary.totals, replayMarkers: 6 },
        replayMarkersByType: { reveal: 2, alert: 1, betrayal: 1, await_open: 1, bookmark: 1 },
        divergenceByOutcome: { aligned: 1, divergent: 2 },
      }),
      makeSummary(baseSummary, { condition: 'C4', runId: 'run_c4_seed_0002', runSeed: 2, winnerIds: ['agent-alpha'] }),
      makeSummary(baseSummary, { condition: 'C5', runId: 'run_c5_seed_0002', runSeed: 2, validityStatus: 'invalid' }),
    ]);

    expect(summary.validRunCount).toBe(3);
    expect(summary.matchedSeedLedger.fullyMatchedSeeds).toEqual([1]);
    expect(summary.matchedSeedLedger.missingByCondition.C5).toEqual([2]);
    expect(summary.conditions.find((condition) => condition.condition === 'C4')?.winnerCounts).toEqual({ 'agent-alpha': 2 });
    const c4c5 = summary.contrasts.find(
      (contrast) => contrast.baseCondition === 'C4' && contrast.compareCondition === 'C5',
    );
    expect(c4c5?.matchedSeedCount).toBe(1);
    expect(c4c5?.averageReplayMarkerCountDelta).toBe(2);

    const rendered = renderMatrixSummary(summary);
    expect(rendered).toContain('Fully matched seeds: 1');
    expect(rendered).toContain('C5-C4 matched=1');
  });

  it('loads artifact bundles and benchmark-summary files into a deterministic matrix report', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-matrix-'));
    const artifactPath = join(dir, 'artifact-bundle.c5.json');
    const summaryPath = join(dir, 'benchmark-summary.c4.json');
    const outputPath = join(dir, 'matrix-summary.json');
    const reportOutputPath = join(dir, 'matrix-report.txt');

    const c5Artifact = {
      ...artifactFixture,
      benchmarkSummary: makeSummary(baseSummary, {
        condition: 'C5',
        runId: 'run_c5_seed_0001',
        runSeed: 1,
        winnerIds: ['agent-saboteur'],
      }),
    };
    const c4Summary = makeSummary(baseSummary, {
      condition: 'C4',
      runId: 'run_c4_seed_0001',
      runSeed: 1,
      winnerIds: ['agent-alpha'],
    });

    await writeFile(artifactPath, JSON.stringify(c5Artifact, null, 2));
    await writeFile(summaryPath, JSON.stringify(c4Summary, null, 2));

    const result = await writeMatrixSummaryFromFiles({
      inputPaths: [artifactPath, summaryPath],
      outputPath,
      reportOutputPath,
      pretty: true,
    });

    const writtenSummary = JSON.parse(await readFile(result.outputPath, 'utf8'));
    const writtenReport = await readFile(result.reportOutputPath, 'utf8');

    expect(writtenSummary.validRunCount).toBe(2);
    expect(writtenSummary.contrasts[0]?.matchedSeedCount).toBe(1);
    expect(writtenReport).toContain('Runs: 2 valid / 2 total');
    expect(writtenReport).toContain('C5-C4 matched=1');
    expect(normalizeBenchmarkSummaryInput(c5Artifact)).toEqual(c5Artifact.benchmarkSummary);
    expect(normalizeBenchmarkSummaryInput(c4Summary)).toEqual(c4Summary);
  });
});
