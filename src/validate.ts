import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import {
  ArtifactBundleSchema,
  AwaitKind,
  AwaitRecordSchema,
  Condition,
  MatchStateSchema,
  ROUND_PHASE_ORDER,
  ReplayBundleSchema,
  ReplayBundle,
  RoundPhase,
  RunManifestSchema,
  type ArtifactBundle,
} from './schema.js';

const phaseIndex = new Map<RoundPhase, number>(ROUND_PHASE_ORDER.map((phase, index) => [phase, index]));

function formatErrors(schema: TSchema, value: unknown): string[] {
  return [...Value.Errors(schema, value)].map((error) => {
    const path = error.path || '/';
    return `${path} ${error.message}`.trim();
  });
}

function validateWith(schema: TSchema, value: unknown): string[] {
  if (Value.Check(schema, value)) {
    return [];
  }

  return formatErrors(schema, value);
}

export function validateRunManifest(value: unknown): string[] {
  return validateWith(RunManifestSchema, value);
}

export function validateMatchState(value: unknown): string[] {
  return validateWith(MatchStateSchema, value);
}

export function validateAwaitRecord(value: unknown): string[] {
  return validateWith(AwaitRecordSchema, value);
}

export function validateReplayBundle(value: unknown): string[] {
  const schemaErrors = validateWith(ReplayBundleSchema, value);
  if (schemaErrors.length > 0) {
    return schemaErrors;
  }

  return validateReplayBundleInvariants(value as ReplayBundle);
}

export function validateArtifactBundle(value: unknown): string[] {
  const schemaErrors = validateWith(ArtifactBundleSchema, value);
  if (schemaErrors.length > 0) {
    return schemaErrors;
  }

  return validateArtifactBundleConsistency(value as ArtifactBundle);
}

export function allowedAwaitKindsForCondition(condition: Condition): AwaitKind[] {
  return condition === 'C5' ? ['question', 'nudge', 'approval'] : [];
}

export function validateReplayBundleInvariants(bundle: ReplayBundle): string[] {
  const errors: string[] = [];

  const firstCursor = bundle.timeline[0];
  if (!firstCursor) {
    errors.push('replay timeline must contain at least one round/phase checkpoint');
    return errors;
  }

  let previousRound = firstCursor.round;
  let previousPhaseIndex = phaseIndex.get(firstCursor.phase) ?? -1;

  for (let index = 1; index < bundle.timeline.length; index += 1) {
    const cursor = bundle.timeline[index];
    if (!cursor) {
      errors.push(`timeline[${index}] is missing`);
      continue;
    }
    const currentPhaseIndex = phaseIndex.get(cursor.phase) ?? -1;

    if (cursor.round < previousRound) {
      errors.push(`timeline[${index}] moves backwards from round ${previousRound} to round ${cursor.round}`);
    }

    if (cursor.round > previousRound + 1) {
      errors.push(`timeline[${index}] skips from round ${previousRound} to round ${cursor.round}`);
    }

    if (cursor.round === previousRound && currentPhaseIndex < previousPhaseIndex) {
      errors.push(`timeline[${index}] regresses phase order within round ${cursor.round}`);
    }

    if (cursor.round === previousRound + 1 && currentPhaseIndex !== 0) {
      errors.push(`timeline[${index}] starts round ${cursor.round} at ${cursor.phase} instead of cast_intro`);
    }

    previousRound = cursor.round;
    previousPhaseIndex = currentPhaseIndex;
  }

  const timelineKeys = new Set(bundle.timeline.map((cursor) => `${cursor.round}:${cursor.phase}`));
  for (const snapshot of bundle.snapshots) {
    if (snapshot.runId !== bundle.runId) {
      errors.push(`snapshot ${snapshot.snapshotId} has runId ${snapshot.runId} but replay bundle is ${bundle.runId}`);
    }

    const key = `${snapshot.cursor.round}:${snapshot.cursor.phase}`;
    if (!timelineKeys.has(key)) {
      errors.push(`snapshot ${snapshot.snapshotId} points at ${key}, which is missing from the replay timeline`);
    }
  }

  for (const marker of bundle.markers) {
    if (marker.runId !== bundle.runId) {
      errors.push(`marker ${marker.markerId} has runId ${marker.runId} but replay bundle is ${bundle.runId}`);
    }

    const key = `${marker.cursor.round}:${marker.cursor.phase}`;
    if (!timelineKeys.has(key)) {
      errors.push(`marker ${marker.markerId} points at ${key}, which is missing from the replay timeline`);
    }
  }

  return errors;
}

export function validateArtifactBundleConsistency(bundle: ArtifactBundle): string[] {
  const errors: string[] = [];
  const runId = bundle.manifest.runId;
  const agentIds = new Set(bundle.roster.map((entry) => entry.agentId));

  if (bundle.replayBundle.runId !== runId) {
    errors.push(`replay bundle runId ${bundle.replayBundle.runId} does not match manifest runId ${runId}`);
  }

  const expectedAffordanceSet = bundle.manifest.condition === 'C5' ? 'intervention-enabled' : 'observation-only';
  if (bundle.manifest.operatorAffordanceSet !== expectedAffordanceSet) {
    errors.push(
      `condition ${bundle.manifest.condition} must use operator affordance set ${expectedAffordanceSet}, got ${bundle.manifest.operatorAffordanceSet}`,
    );
  }

  errors.push(...validateReplayBundleInvariants(bundle.replayBundle));

  for (const event of bundle.publicEvents) {
    if (event.runId !== runId) {
      errors.push(`public event ${event.eventId} has runId ${event.runId} but manifest runId is ${runId}`);
    }

    for (const agentId of event.actorAgentIds) {
      if (!agentIds.has(agentId)) {
        errors.push(`public event ${event.eventId} references unknown agent ${agentId}`);
      }
    }
  }

  for (const commitment of bundle.structuredCommitments) {
    if (!agentIds.has(commitment.agentId)) {
      errors.push(`commitment ${commitment.commitmentId} references unknown agent ${commitment.agentId}`);
    }
  }

  for (const artifact of bundle.privateArtifacts) {
    if (artifact.runId !== runId) {
      errors.push(`private artifact ${artifact.artifactId} has runId ${artifact.runId} but manifest runId is ${runId}`);
    }

    if (!agentIds.has(artifact.agentId)) {
      errors.push(`private artifact ${artifact.artifactId} references unknown agent ${artifact.agentId}`);
    }
  }

  for (const alert of bundle.alerts) {
    if (alert.runId !== runId) {
      errors.push(`alert ${alert.alertId} has runId ${alert.runId} but manifest runId is ${runId}`);
    }
  }

  const allowedAwaitKinds = new Set(allowedAwaitKindsForCondition(bundle.manifest.condition));
  if (bundle.manifest.condition !== 'C5' && bundle.interventions.length > 0) {
    errors.push(`condition ${bundle.manifest.condition} must not emit live intervention records`);
  }

  for (const intervention of bundle.interventions) {
    if (intervention.runId !== runId) {
      errors.push(`intervention ${intervention.interventionId} has runId ${intervention.runId} but manifest runId is ${runId}`);
    }

    if (!allowedAwaitKinds.has(intervention.kind)) {
      errors.push(
        `condition ${bundle.manifest.condition} does not allow intervention kind ${intervention.kind} on ${intervention.interventionId}`,
      );
    }
  }

  for (const taskOutput of bundle.taskOutputs) {
    if (taskOutput.runId !== runId) {
      errors.push(`task output ${taskOutput.submissionId} has runId ${taskOutput.runId} but manifest runId is ${runId}`);
    }

    if (!agentIds.has(taskOutput.agentId)) {
      errors.push(`task output ${taskOutput.submissionId} references unknown agent ${taskOutput.agentId}`);
    }
  }

  for (const row of bundle.finalScores) {
    if (!agentIds.has(row.agentId)) {
      errors.push(`final score row references unknown agent ${row.agentId}`);
    }
  }

  return errors;
}
