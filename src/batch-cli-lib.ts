import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { createMatrixSummary, renderMatrixSummary } from './matrix.js';
import type {
  BenchmarkBatchLedger,
  BenchmarkBatchPlan,
  BenchmarkBatchRunOverride,
  BenchmarkBatchRunRecord,
  BenchmarkSummary,
  Condition,
  MemoryMode,
  OperatorAffordanceSet,
  RosterEntry,
  RosterMode,
  RunManifest,
} from './schema.js';
import { runHarnessBundleFromFile } from './bundle-cli-lib.js';
import type { DeterministicRunnerInput } from './runner.js';
import { validateBenchmarkBatchPlan } from './validate.js';

const CONDITION_BASELINES: Record<Condition, {
  rosterMode: RosterMode;
  memoryMode: MemoryMode;
  operatorAffordanceSet: OperatorAffordanceSet;
}> = {
  C1: { rosterMode: 'same-model', memoryMode: 'off', operatorAffordanceSet: 'observation-only' },
  C2: { rosterMode: 'same-model', memoryMode: 'on', operatorAffordanceSet: 'observation-only' },
  C3: { rosterMode: 'mixed-model', memoryMode: 'off', operatorAffordanceSet: 'observation-only' },
  C4: { rosterMode: 'mixed-model', memoryMode: 'on', operatorAffordanceSet: 'observation-only' },
  'C4*': { rosterMode: 'mixed-model', memoryMode: 'on', operatorAffordanceSet: 'observation-only' },
  C5: { rosterMode: 'mixed-model', memoryMode: 'on', operatorAffordanceSet: 'intervention-enabled' },
};

const CONDITION_ORDER: readonly Condition[] = ['C1', 'C2', 'C3', 'C4', 'C4*', 'C5'];

export interface BatchCliOptions {
  planPath: string;
  outputDir: string;
  pretty: boolean;
}

export interface BatchCliResult {
  resolvedPlanPath: string;
  batchPlanPath: string;
  batchLedgerPath: string;
  matrixInputsPath: string;
  matrixSummaryPath: string;
  matrixReportPath: string;
}

interface ExecutedRun {
  record: BenchmarkBatchRunRecord;
  summary: BenchmarkSummary;
}

function padSeed(runSeed: number): string {
  return String(runSeed).padStart(4, '0');
}

function sanitizeCondition(condition: Condition): string {
  return condition.toLowerCase().replace('*', 'star');
}

function sortConditions(values: readonly Condition[]): Condition[] {
  return [...values].sort((left, right) => CONDITION_ORDER.indexOf(left) - CONDITION_ORDER.indexOf(right));
}

function sortRuns(values: readonly ExecutedRun[]): ExecutedRun[] {
  return [...values].sort((left, right) => {
    if (left.record.runSeed !== right.record.runSeed) {
      return left.record.runSeed - right.record.runSeed;
    }

    return CONDITION_ORDER.indexOf(left.record.condition) - CONDITION_ORDER.indexOf(right.record.condition);
  });
}

function computeFullyMatchedSeeds(
  runs: readonly ExecutedRun[],
  declaredConditions: readonly Condition[],
): number[] {
  const validByCondition = new Map<Condition, Set<number>>();
  for (const condition of declaredConditions) {
    validByCondition.set(condition, new Set<number>());
  }

  for (const run of runs) {
    if (run.record.validityStatus !== 'valid') {
      continue;
    }

    validByCondition.get(run.record.condition)?.add(run.record.runSeed);
  }

  const unionSeeds = [...new Set(
    runs
      .filter((run) => run.record.validityStatus === 'valid')
      .map((run) => run.record.runSeed),
  )].sort((left, right) => left - right);

  return unionSeeds.filter((seed) =>
    declaredConditions.every((condition) => validByCondition.get(condition)?.has(seed)),
  );
}

function normalizeRosterForCondition(
  roster: readonly RosterEntry[],
  rosterMode: RosterMode,
  memoryMode: MemoryMode,
): RosterEntry[] {
  const modelTemplate = roster[0];
  if (!modelTemplate) {
    return [];
  }

  return roster.map((entry) => ({
    ...entry,
    modelFamily: rosterMode === 'same-model' ? modelTemplate.modelFamily : entry.modelFamily,
    modelVersion: rosterMode === 'same-model' ? modelTemplate.modelVersion : entry.modelVersion,
    memoryEnabled: memoryMode === 'on',
  }));
}

function resolveRunOverride(
  plan: BenchmarkBatchPlan,
  condition: Condition,
  runSeed: number,
): BenchmarkBatchRunOverride | undefined {
  return plan.runOverrides?.find((override) => override.condition === condition && override.runSeed === runSeed);
}

function materializeRunInput(
  template: DeterministicRunnerInput,
  batchId: string,
  condition: Condition,
  runSeed: number,
  override: BenchmarkBatchRunOverride | undefined,
): DeterministicRunnerInput {
  const baseline = CONDITION_BASELINES[condition];
  const manifest: RunManifest = {
    ...template.manifest,
    runId: `run_${batchId}_${sanitizeCondition(condition)}_seed_${padSeed(runSeed)}`,
    matchId: `match_${batchId}_seed_${padSeed(runSeed)}`,
    condition,
    runSeed,
    rosterMode: baseline.rosterMode,
    memoryMode: baseline.memoryMode,
    operatorAffordanceSet: baseline.operatorAffordanceSet,
    codeRevision: override?.codeRevision ?? template.manifest.codeRevision,
    validityStatus: override?.validityStatus ?? 'valid',
    ...(override?.invalidationReason ? { invalidationReason: override.invalidationReason } : {}),
  };

  if (!override?.invalidationReason && manifest.validityStatus === 'valid') {
    delete manifest.invalidationReason;
  }

  return {
    manifest,
    roster: normalizeRosterForCondition(template.roster, baseline.rosterMode, baseline.memoryMode),
    rounds: template.rounds.map((round) => ({
      ...round,
      ...(round.structuredCommitments
        ? {
            structuredCommitments: round.structuredCommitments.map((envelope) => ({
              ...envelope,
              runId: manifest.runId,
              matchId: manifest.matchId,
              commitments: envelope.commitments.map((commitment) => ({
                ...commitment,
                linkedEventIds: [...commitment.linkedEventIds],
              })),
            })),
          }
        : {}),
      ...(round.privateArtifacts
        ? {
            privateArtifacts: round.privateArtifacts.map((artifact) => ({
              ...artifact,
              runId: manifest.runId,
              linkedEventIds: [...artifact.linkedEventIds],
              linkedCommitmentIds: [...artifact.linkedCommitmentIds],
              commitmentClaims: artifact.commitmentClaims.map((claim) => ({
                ...claim,
                payload: { ...claim.payload },
              })),
            })),
          }
        : {}),
      ...(round.publicUtterances
        ? {
            publicUtterances: round.publicUtterances.map((utterance) => ({
              ...utterance,
              ...(utterance.commitmentClaims
                ? {
                    commitmentClaims: utterance.commitmentClaims.map((claim) => ({
                      ...claim,
                      payload: { ...claim.payload },
                    })),
                  }
                : {}),
            })),
          }
        : {}),
      ...(round.saboteurBonusAgentIds ? { saboteurBonusAgentIds: [...round.saboteurBonusAgentIds] } : {}),
      ...(round.awaitingDefaults
        ? {
            awaitingDefaults: round.awaitingDefaults.map((awaitRecord) => ({
              ...awaitRecord,
              scope: {
                ...awaitRecord.scope,
                runId: manifest.runId,
                matchId: manifest.matchId,
              },
            })),
          }
        : {}),
      ...(round.alerts ? { alerts: round.alerts.map((alert) => ({ ...alert, runId: manifest.runId })) } : {}),
      ...(round.taskOutputs
        ? {
            taskOutputs: round.taskOutputs.map((taskOutput) => ({ ...taskOutput, runId: manifest.runId })),
          }
        : {}),
    })),
  };
}

export function parseBatchCliArgs(args: readonly string[]): BatchCliOptions {
  let planPath: string | undefined;
  let outputDir: string | undefined;
  let pretty = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--plan') {
      planPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--output-dir') {
      outputDir = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!planPath) {
    throw new Error('missing required --plan <benchmark-batch-plan.json>');
  }

  if (!outputDir) {
    throw new Error('missing required --output-dir <dir>');
  }

  return {
    planPath: resolve(planPath),
    outputDir: resolve(outputDir),
    pretty,
  };
}

export async function writeBenchmarkBatchFromPlan(options: BatchCliOptions): Promise<BatchCliResult> {
  const rawPlan = await readFile(options.planPath, 'utf8');
  const parsedPlan = JSON.parse(rawPlan) as BenchmarkBatchPlan;
  const planErrors = validateBenchmarkBatchPlan(parsedPlan);
  if (planErrors.length > 0) {
    throw new Error(`benchmark batch plan is invalid: ${planErrors.join('; ')}`);
  }

  const planDir = dirname(options.planPath);
  const normalizedPlan: BenchmarkBatchPlan = {
    ...parsedPlan,
    conditions: sortConditions(parsedPlan.conditions.map((condition) => condition.condition)).map((condition) => ({
      condition,
      inputPath: resolve(
        planDir,
        parsedPlan.conditions.find((entry) => entry.condition === condition)?.inputPath ?? '',
      ),
    })),
    ...(parsedPlan.runOverrides
      ? {
          runOverrides: parsedPlan.runOverrides.map((override) => ({
            ...override,
            ...(override.inputPath ? { inputPath: resolve(planDir, override.inputPath) } : {}),
          })),
        }
      : {}),
  };

  await mkdir(options.outputDir, { recursive: true });
  const batchPlanPath = join(options.outputDir, 'batch-plan.json');
  const batchLedgerPath = join(options.outputDir, 'batch-ledger.json');
  const matrixInputsPath = join(options.outputDir, 'matrix-inputs.json');
  const matrixSummaryPath = join(options.outputDir, 'matrix-summary.json');
  const matrixReportPath = join(options.outputDir, 'matrix-report.txt');

  await writeFile(batchPlanPath, JSON.stringify(normalizedPlan, null, options.pretty ? 2 : undefined));

  const templateCache = new Map<string, DeterministicRunnerInput>();
  const executedRuns: ExecutedRun[] = [];

  for (const runSeed of normalizedPlan.seedLedger) {
    for (const conditionPlan of normalizedPlan.conditions) {
      const override = resolveRunOverride(normalizedPlan, conditionPlan.condition, runSeed);
      const inputPath = override?.inputPath ?? conditionPlan.inputPath;

      let template = templateCache.get(inputPath);
      if (!template) {
        const rawInput = await readFile(inputPath, 'utf8');
        template = JSON.parse(rawInput) as DeterministicRunnerInput;
        templateCache.set(inputPath, template);
      }

      const materializedInput = materializeRunInput(
        template,
        normalizedPlan.batchId,
        conditionPlan.condition,
        runSeed,
        override,
      );

      const runDir = join(options.outputDir, 'runs', `seed-${padSeed(runSeed)}`, conditionPlan.condition);
      const runInputPath = join(runDir, 'match-input.json');
      await mkdir(runDir, { recursive: true });
      await writeFile(runInputPath, JSON.stringify(materializedInput, null, options.pretty ? 2 : undefined));

      const result = await runHarnessBundleFromFile({
        inputPath: runInputPath,
        outputDir: runDir,
        pretty: options.pretty,
      });

      const summary = result.artifactBundle.benchmarkSummary;
      executedRuns.push({
        summary,
        record: {
          runId: summary.runId,
          matchId: summary.matchId,
          condition: summary.condition,
          runSeed: summary.runSeed,
          validityStatus: summary.validityStatus,
          ...(materializedInput.manifest.invalidationReason ? { invalidationReason: materializedInput.manifest.invalidationReason } : {}),
          selectedForMatrix: false,
          inputPath: relative(options.outputDir, runInputPath),
          outputDir: relative(options.outputDir, runDir),
          artifactPath: relative(options.outputDir, result.artifactPath),
          reportPath: relative(options.outputDir, result.reportPath),
          benchmarkSummaryPath: relative(options.outputDir, result.benchmarkSummaryPath),
        },
      });
    }

    const fullyMatchedSeeds = computeFullyMatchedSeeds(executedRuns, normalizedPlan.conditions.map((condition) => condition.condition));
    if (fullyMatchedSeeds.length >= normalizedPlan.targetMatchedSeedCount) {
      break;
    }
  }

  const fullyMatchedSeeds = computeFullyMatchedSeeds(executedRuns, normalizedPlan.conditions.map((condition) => condition.condition));
  const selectedSeeds = fullyMatchedSeeds.slice(0, normalizedPlan.targetMatchedSeedCount);

  const selectedRuns = sortRuns(
    executedRuns.filter((run) =>
      run.record.validityStatus === 'valid'
      && selectedSeeds.includes(run.record.runSeed),
    ),
  );
  const selectedRunIds = new Set(selectedRuns.map((run) => run.record.runId));

  for (const executed of executedRuns) {
    executed.record.selectedForMatrix = selectedRunIds.has(executed.record.runId);
  }

  const matrixSummary = createMatrixSummary(selectedRuns.map((run) => run.summary));
  const matrixReport = renderMatrixSummary(matrixSummary);
  const matrixInputPaths = selectedRuns.map((run) => run.record.benchmarkSummaryPath);

  const batchLedger: BenchmarkBatchLedger = {
    batchId: normalizedPlan.batchId,
    declaredConditions: normalizedPlan.conditions.map((condition) => condition.condition),
    declaredSeedLedger: [...normalizedPlan.seedLedger],
    targetMatchedSeedCount: normalizedPlan.targetMatchedSeedCount,
    fullyMatchedSeeds,
    selectedSeeds,
    targetReached: selectedSeeds.length >= normalizedPlan.targetMatchedSeedCount,
    executedRunCount: executedRuns.length,
    matrixInputPaths,
    runs: sortRuns(executedRuns).map((run) => run.record),
  };

  await writeFile(batchLedgerPath, JSON.stringify(batchLedger, null, options.pretty ? 2 : undefined));
  await writeFile(
    matrixInputsPath,
    JSON.stringify(
      {
        batchId: batchLedger.batchId,
        selectedSeeds: batchLedger.selectedSeeds,
        benchmarkSummaryPaths: matrixInputPaths,
      },
      null,
      options.pretty ? 2 : undefined,
    ),
  );
  await writeFile(matrixSummaryPath, JSON.stringify(matrixSummary, null, options.pretty ? 2 : undefined));
  await writeFile(matrixReportPath, matrixReport);

  return {
    resolvedPlanPath: options.planPath,
    batchPlanPath,
    batchLedgerPath,
    matrixInputsPath,
    matrixSummaryPath,
    matrixReportPath,
  };
}

export function batchUsageText(): string {
  return 'Usage: agent-kumite-batch --plan <benchmark-batch-plan.json> --output-dir <dir> [--pretty]';
}
