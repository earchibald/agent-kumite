import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { resolveAwaitByDefault } from './engine.js';
import { runDeterministicMatch, type DeterministicRunnerInput } from './runner.js';
import type {
  AcpAwaitOpenedEnvelope,
  AcpAwaitResolvedEnvelope,
  AcpIngressEnvelope,
  AcpPhaseTransitionEnvelope,
  AwaitRecord,
  MatchState,
  RoundPhase,
} from './schema.js';

const ROUND_PHASE_ORDER: readonly RoundPhase[] = [
  'cast_intro',
  'private_negotiation',
  'structured_commitment_submission',
  'public_square',
  'task_submission',
  'simultaneous_reveal',
  'resolution_pressure_escalation',
  'elimination_aftermath',
  'task_scoring_debrief',
] as const;

export interface RuntimeAcpIngressCliOptions {
  inputPath: string;
  outputPath: string;
  outputFormat: 'json-array' | 'ndjson';
  pretty: boolean;
}

export interface RuntimeAcpIngressCliResult {
  outputPath: string;
  envelopeCount: number;
}

function phaseOrderIndex(phase: MatchState['current']['phase']): number {
  const index = ROUND_PHASE_ORDER.indexOf(phase);
  if (index === -1) {
    throw new Error(`unknown phase ${phase}`);
  }
  return index;
}

function isoTimestamp(round: number, phase: MatchState['current']['phase'], offset = 0): string {
  const totalMinutes = (round - 1) * 10 + phaseOrderIndex(phase);
  const minutes = String(Math.floor((totalMinutes + offset) % 60)).padStart(2, '0');
  const hours = String(Math.floor((totalMinutes + offset) / 60)).padStart(2, '0');
  return `2026-05-14T${hours}:${minutes}:00Z`;
}

function transitionEnvelope(
  input: DeterministicRunnerInput,
  round: number,
  fromPhase: RoundPhase,
  toPhase: RoundPhase,
  sequence: number,
): AcpPhaseTransitionEnvelope {
  return {
    envelopeId: `acp_env_r${round}_${fromPhase}_to_${toPhase}`,
    kind: 'phase_transition',
    runId: input.manifest.runId,
    matchId: input.manifest.matchId,
    cursor: {
      round,
      phase: toPhase,
    },
    timestamp: isoTimestamp(round, toPhase),
    source: {
      sessionId: 'session_runtime_exporter',
      serverId: 'runtime_exporter',
      messageId: `msg_phase_${sequence + 1}`,
    },
    payload: {
      fromPhase,
      toPhase,
      actorAgentIds: [],
      linkedCommitmentIds: [],
      commitmentClaims: [],
      summary: `Entered ${toPhase} for round ${round}.`,
      metadata: {
        transitionReason: 'round_loop_advance',
      },
    },
  };
}

function nextRoundEnvelope(
  input: DeterministicRunnerInput,
  nextRound: number,
  sequence: number,
): AcpPhaseTransitionEnvelope {
  return {
    envelopeId: `acp_env_r${nextRound}_phase_open`,
    kind: 'phase_transition',
    runId: input.manifest.runId,
    matchId: input.manifest.matchId,
    cursor: {
      round: nextRound,
      phase: 'cast_intro',
    },
    timestamp: isoTimestamp(nextRound, 'cast_intro'),
    source: {
      sessionId: 'session_runtime_exporter',
      serverId: 'runtime_exporter',
      messageId: `msg_phase_${sequence + 1}`,
    },
    payload: {
      fromPhase: 'task_scoring_debrief',
      toPhase: 'cast_intro',
      actorAgentIds: [],
      linkedCommitmentIds: [],
      commitmentClaims: [],
      summary: `Opened round ${nextRound}.`,
      metadata: {
        transitionReason: 'round_loop_advance',
      },
    },
  };
}

function contextualizeAwaitRecord(
  input: DeterministicRunnerInput,
  round: number,
  awaitRecord: AwaitRecord,
): AwaitRecord {
  return {
    ...awaitRecord,
    scope: {
      ...awaitRecord.scope,
      runId: input.manifest.runId,
      matchId: input.manifest.matchId,
      round,
      phase: 'task_submission',
    },
  };
}

function awaitOpenedEnvelope(input: DeterministicRunnerInput, round: number, awaitRecord: AwaitRecord): AcpAwaitOpenedEnvelope {
  return {
    envelopeId: `${awaitRecord.awaitId}:opened`,
    kind: 'await_opened',
    runId: input.manifest.runId,
    matchId: input.manifest.matchId,
    cursor: {
      round,
      phase: 'task_submission',
    },
    timestamp: awaitRecord.openedAt,
    source: {
      sessionId: 'session_runtime_exporter',
      serverId: 'runtime_exporter',
    },
    payload: {
      await: awaitRecord,
    },
  };
}

function awaitResolvedEnvelope(input: DeterministicRunnerInput, round: number, awaitRecord: AwaitRecord): AcpAwaitResolvedEnvelope {
  const resolution = resolveAwaitByDefault(
    awaitRecord,
    input.manifest.condition,
    isoTimestamp(round, 'task_submission', 1),
  );
  return {
    envelopeId: `${awaitRecord.awaitId}:resolved`,
    kind: 'await_resolved',
    runId: input.manifest.runId,
    matchId: input.manifest.matchId,
    cursor: {
      round,
      phase: 'task_submission',
    },
    timestamp: resolution.interventionRecord.resolvedAt!,
    source: {
      sessionId: 'session_runtime_exporter',
      serverId: 'runtime_exporter',
      ...(resolution.interventionRecord.operatorId ? { agentId: resolution.interventionRecord.operatorId } : {}),
    },
    payload: {
      awaitId: awaitRecord.awaitId,
      kind: awaitRecord.kind,
      status: resolution.interventionRecord.status,
      ...(resolution.interventionRecord.choiceId ? { choiceId: resolution.interventionRecord.choiceId } : {}),
      ...(resolution.interventionRecord.operatorId ? { operatorId: resolution.interventionRecord.operatorId } : {}),
      resolvedAt: resolution.interventionRecord.resolvedAt!,
    },
  };
}

export function exportRuntimeAcpIngress(
  input: DeterministicRunnerInput,
): AcpIngressEnvelope[] {
  const result = runDeterministicMatch(input);
  const envelopes: AcpIngressEnvelope[] = [];
  let phaseSequence = 0;

  for (let index = 0; index < input.rounds.length; index += 1) {
    const round = index + 1;
    const phases: readonly RoundPhase[] = [
      'private_negotiation',
      'structured_commitment_submission',
      'public_square',
      'task_submission',
      'simultaneous_reveal',
      'resolution_pressure_escalation',
      'elimination_aftermath',
      'task_scoring_debrief',
    ];

    let fromPhase: RoundPhase = 'cast_intro';
    for (const toPhase of phases) {
      envelopes.push(transitionEnvelope(input, round, fromPhase, toPhase, phaseSequence));
      phaseSequence += 1;

      if (toPhase === 'task_submission') {
        for (const awaitRecord of input.rounds[index]?.awaitingDefaults ?? []) {
          const contextualized = contextualizeAwaitRecord(input, round, awaitRecord);
          envelopes.push(awaitOpenedEnvelope(input, round, contextualized));
          envelopes.push(awaitResolvedEnvelope(input, round, contextualized));
        }
      }

      fromPhase = toPhase;
    }

    const closingSnapshot = result.snapshots[index];
    const shouldComplete = round === input.rounds.length || (closingSnapshot?.state.aliveAgentIds.length ?? 0) <= 1 || round === 5;
    if (!shouldComplete) {
      envelopes.push(nextRoundEnvelope(input, round + 1, phaseSequence));
      phaseSequence += 1;
    }
  }

  return envelopes;
}

export function parseRuntimeAcpIngressCliArgs(args: readonly string[]): RuntimeAcpIngressCliOptions {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let outputFormat: 'json-array' | 'ndjson' = 'json-array';
  let pretty = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--input') {
      inputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--output') {
      outputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--output-format') {
      const value = args[index + 1];
      if (value !== 'json-array' && value !== 'ndjson') {
        throw new Error('--output-format must be one of json-array or ndjson');
      }
      outputFormat = value;
      index += 1;
      continue;
    }

    if (arg === '--pretty') {
      pretty = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error('missing required --input <match.json>');
  }

  if (!outputPath) {
    throw new Error('missing required --output <acp-ingress.json|ndjson>');
  }

  return {
    inputPath: resolve(inputPath),
    outputPath: resolve(outputPath),
    outputFormat,
    pretty,
  };
}

export async function writeRuntimeAcpIngressFromFile(
  options: RuntimeAcpIngressCliOptions,
): Promise<RuntimeAcpIngressCliResult> {
  const raw = await readFile(options.inputPath, 'utf8');
  const input = JSON.parse(raw) as DeterministicRunnerInput;
  const envelopes = exportRuntimeAcpIngress(input);
  const body = options.outputFormat === 'ndjson'
    ? `${envelopes.map((envelope) => JSON.stringify(envelope)).join('\n')}\n`
    : JSON.stringify(envelopes, null, options.pretty ? 2 : undefined);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, body);
  return {
    outputPath: options.outputPath,
    envelopeCount: envelopes.length,
  };
}

export function runtimeAcpIngressUsageText(): string {
  return 'Usage: agent-kumite-live-export-acp --input <match.json> --output <acp-ingress.json|ndjson> [--output-format <json-array|ndjson>] [--pretty]';
}
