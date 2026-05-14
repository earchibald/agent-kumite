import type { ArtifactBundle, BenchmarkSummary, Condition } from './schema.js';

const CONDITION_ORDER: readonly Condition[] = ['C1', 'C2', 'C3', 'C4', 'C4*', 'C5'];
const PRIMARY_CONTRASTS = [
  ['C1', 'C3'],
  ['C2', 'C4'],
  ['C1', 'C2'],
  ['C3', 'C4'],
  ['C4', 'C5'],
] as const;

export interface MatrixRunDigest {
  runId: string;
  matchId: string;
  condition: Condition;
  runSeed: number;
  validityStatus: BenchmarkSummary['validityStatus'];
  winnerIds: string[];
  roundsPlayed: number;
  divergenceRate: number;
  replayMarkerCount: number;
}

export interface MatrixConditionSummary {
  condition: Condition;
  validRunCount: number;
  uniqueSeedCount: number;
  matchedSeedCount: number;
  winnerCounts: Record<string, number>;
  averageDivergenceRate: number;
  averageReplayMarkerCount: number;
  averageRoundsPlayed: number;
}

export interface MatrixContrastSummary {
  baseCondition: Condition;
  compareCondition: Condition;
  matchedSeedCount: number;
  matchedSeeds: number[];
  averageDivergenceRateDelta: number;
  averageReplayMarkerCountDelta: number;
  averageRoundsPlayedDelta: number;
}

export interface MatrixSummary {
  totalRunCount: number;
  validRunCount: number;
  representedConditions: Condition[];
  matchedSeedLedger: {
    unionSeeds: number[];
    fullyMatchedSeeds: number[];
    missingByCondition: Record<string, number[]>;
  };
  runs: MatrixRunDigest[];
  conditions: MatrixConditionSummary[];
  contrasts: MatrixContrastSummary[];
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function countByKey(values: readonly string[]): Record<string, number> {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function sortConditions(values: readonly Condition[]): Condition[] {
  return [...values].sort((left, right) => CONDITION_ORDER.indexOf(left) - CONDITION_ORDER.indexOf(right));
}

function sortDigests(values: readonly MatrixRunDigest[]): MatrixRunDigest[] {
  return [...values].sort((left, right) => {
    const conditionDelta = CONDITION_ORDER.indexOf(left.condition) - CONDITION_ORDER.indexOf(right.condition);
    if (conditionDelta !== 0) {
      return conditionDelta;
    }

    if (left.runSeed !== right.runSeed) {
      return left.runSeed - right.runSeed;
    }

    return left.runId.localeCompare(right.runId);
  });
}

function divergenceRate(summary: BenchmarkSummary): number {
  const divergent = summary.divergenceByOutcome.divergent ?? 0;
  return summary.totals.structuredCommitments > 0 ? divergent / summary.totals.structuredCommitments : 0;
}

function toDigest(summary: BenchmarkSummary): MatrixRunDigest {
  return {
    runId: summary.runId,
    matchId: summary.matchId,
    condition: summary.condition,
    runSeed: summary.runSeed,
    validityStatus: summary.validityStatus,
    winnerIds: [...summary.winnerIds],
    roundsPlayed: summary.roundsPlayed,
    divergenceRate: roundMetric(divergenceRate(summary)),
    replayMarkerCount: summary.totals.replayMarkers,
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageDigestBySeed(digests: readonly MatrixRunDigest[]): Map<number, MatrixRunDigest> {
  const grouped = new Map<number, MatrixRunDigest[]>();
  for (const digest of digests) {
    const list = grouped.get(digest.runSeed) ?? [];
    list.push(digest);
    grouped.set(digest.runSeed, list);
  }

  return new Map(
    [...grouped.entries()]
      .sort(([left], [right]) => left - right)
      .map(([seed, seedDigests]) => [
        seed,
        {
          ...seedDigests[0]!,
          runId: seedDigests.map((digest) => digest.runId).sort().join(','),
          winnerIds: [...new Set(seedDigests.flatMap((digest) => digest.winnerIds))].sort(),
          roundsPlayed: roundMetric(average(seedDigests.map((digest) => digest.roundsPlayed))),
          divergenceRate: roundMetric(average(seedDigests.map((digest) => digest.divergenceRate))),
          replayMarkerCount: roundMetric(average(seedDigests.map((digest) => digest.replayMarkerCount))),
        },
      ]),
  );
}

export function createMatrixSummary(summaries: readonly BenchmarkSummary[]): MatrixSummary {
  const digests = sortDigests(summaries.filter((summary) => summary.validityStatus === 'valid').map(toDigest));
  const representedConditions = sortConditions([...new Set(digests.map((digest) => digest.condition))]);
  const runsByCondition = new Map<Condition, MatrixRunDigest[]>();
  for (const condition of representedConditions) {
    runsByCondition.set(
      condition,
      digests.filter((digest) => digest.condition === condition),
    );
  }

  const unionSeeds = [...new Set(digests.map((digest) => digest.runSeed))].sort((left, right) => left - right);
  const fullyMatchedSeeds = unionSeeds.filter((seed) =>
    representedConditions.every((condition) =>
      (runsByCondition.get(condition) ?? []).some((digest) => digest.runSeed === seed),
    ),
  );

  const missingByCondition = Object.fromEntries(
    representedConditions.map((condition) => [
      condition,
      unionSeeds.filter((seed) => !(runsByCondition.get(condition) ?? []).some((digest) => digest.runSeed === seed)),
    ]),
  );

  const conditions = representedConditions.map<MatrixConditionSummary>((condition) => {
    const conditionRuns = runsByCondition.get(condition) ?? [];
    return {
      condition,
      validRunCount: conditionRuns.length,
      uniqueSeedCount: new Set(conditionRuns.map((digest) => digest.runSeed)).size,
      matchedSeedCount: fullyMatchedSeeds.filter((seed) => conditionRuns.some((digest) => digest.runSeed === seed)).length,
      winnerCounts: countByKey(conditionRuns.flatMap((digest) => digest.winnerIds)),
      averageDivergenceRate: roundMetric(average(conditionRuns.map((digest) => digest.divergenceRate))),
      averageReplayMarkerCount: roundMetric(average(conditionRuns.map((digest) => digest.replayMarkerCount))),
      averageRoundsPlayed: roundMetric(average(conditionRuns.map((digest) => digest.roundsPlayed))),
    };
  });

  const contrasts = PRIMARY_CONTRASTS
    .filter(([baseCondition, compareCondition]) =>
      representedConditions.includes(baseCondition) && representedConditions.includes(compareCondition),
    )
    .map<MatrixContrastSummary>(([baseCondition, compareCondition]) => {
      const baseBySeed = averageDigestBySeed(runsByCondition.get(baseCondition) ?? []);
      const compareBySeed = averageDigestBySeed(runsByCondition.get(compareCondition) ?? []);
      const matchedSeeds = [...baseBySeed.keys()]
        .filter((seed) => compareBySeed.has(seed))
        .sort((left, right) => left - right);

      const divergenceDeltas = matchedSeeds.map((seed) => (compareBySeed.get(seed)?.divergenceRate ?? 0) - (baseBySeed.get(seed)?.divergenceRate ?? 0));
      const replayMarkerDeltas = matchedSeeds.map((seed) => (compareBySeed.get(seed)?.replayMarkerCount ?? 0) - (baseBySeed.get(seed)?.replayMarkerCount ?? 0));
      const roundDeltas = matchedSeeds.map((seed) => (compareBySeed.get(seed)?.roundsPlayed ?? 0) - (baseBySeed.get(seed)?.roundsPlayed ?? 0));

      return {
        baseCondition,
        compareCondition,
        matchedSeedCount: matchedSeeds.length,
        matchedSeeds,
        averageDivergenceRateDelta: roundMetric(average(divergenceDeltas)),
        averageReplayMarkerCountDelta: roundMetric(average(replayMarkerDeltas)),
        averageRoundsPlayedDelta: roundMetric(average(roundDeltas)),
      };
    });

  return {
    totalRunCount: summaries.length,
    validRunCount: digests.length,
    representedConditions,
    matchedSeedLedger: {
      unionSeeds,
      fullyMatchedSeeds,
      missingByCondition,
    },
    runs: digests,
    conditions,
    contrasts,
  };
}

export function renderMatrixSummary(summary: MatrixSummary): string {
  const lines: string[] = [];

  lines.push(`Runs: ${summary.validRunCount} valid / ${summary.totalRunCount} total`);
  lines.push(`Conditions: ${summary.representedConditions.join(', ') || 'none'}`);
  lines.push(`Fully matched seeds: ${summary.matchedSeedLedger.fullyMatchedSeeds.join(', ') || 'none'}`);
  lines.push('');
  lines.push('Condition summaries:');
  for (const condition of summary.conditions) {
    const winners = Object.entries(condition.winnerCounts)
      .map(([winnerId, count]) => `${winnerId}:${count}`)
      .join(', ') || 'none';
    lines.push(
      `${condition.condition} runs=${condition.validRunCount} matched=${condition.matchedSeedCount} divergence=${condition.averageDivergenceRate} markers=${condition.averageReplayMarkerCount} winners=${winners}`,
    );
  }

  lines.push('');
  lines.push('Condition deltas:');
  if (summary.contrasts.length === 0) {
    lines.push('none');
  } else {
    for (const contrast of summary.contrasts) {
      lines.push(
        `${contrast.compareCondition}-${contrast.baseCondition} matched=${contrast.matchedSeedCount} divergence_delta=${contrast.averageDivergenceRateDelta} marker_delta=${contrast.averageReplayMarkerCountDelta} round_delta=${contrast.averageRoundsPlayedDelta}`,
      );
    }
  }

  return lines.join('\n');
}

export function normalizeBenchmarkSummaryInput(value: unknown): BenchmarkSummary {
  if (isArtifactBundle(value)) {
    return value.benchmarkSummary;
  }

  if (isBenchmarkSummary(value)) {
    return value;
  }

  throw new Error('input must be an artifact bundle or benchmark-summary JSON');
}

function isArtifactBundle(value: unknown): value is ArtifactBundle {
  return Boolean(
    value
    && typeof value === 'object'
    && 'manifest' in value
    && 'benchmarkSummary' in value,
  );
}

function isBenchmarkSummary(value: unknown): value is BenchmarkSummary {
  return Boolean(
    value
    && typeof value === 'object'
    && 'runId' in value
    && 'condition' in value
    && 'runSeed' in value
    && 'totals' in value
    && 'replayMarkersByType' in value
    && 'divergenceByOutcome' in value,
  );
}
