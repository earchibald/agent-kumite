import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import {
  ArtifactBundleSchema,
  AwaitKind,
  AwaitRecordSchema,
  CommitmentClaim,
  Condition,
  MatchStateSchema,
  ROUND_PHASE_ORDER,
  ReplayBundleSchema,
  ReplayBundle,
  RoundPhase,
  RunManifestSchema,
  type ArtifactBundle,
  type CommitmentDivergenceRecord,
  type PrivateArtifactRef,
  type PublicEvent,
  type SpeechCommitmentLinkRecord,
  type StructuredCommitment,
  type StructuredCommitmentEnvelope,
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
  const matchId = bundle.manifest.matchId;
  const agentIds = new Set(bundle.roster.map((entry) => entry.agentId));
  const commitmentIds = new Set<string>();

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

    errors.push(...validateCommitmentClaims(event.eventId, event.commitmentClaims, event.linkedCommitmentIds));
  }

  for (const envelope of bundle.structuredCommitments) {
    errors.push(...validateStructuredCommitmentEnvelope(envelope, { runId, matchId, agentIds, commitmentIds }));
  }

  for (const event of bundle.publicEvents) {
    for (const commitmentId of event.linkedCommitmentIds) {
      if (!commitmentIds.has(commitmentId)) {
        errors.push(`public event ${event.eventId} references unknown commitment ${commitmentId}`);
      }
    }
  }

  for (const artifact of bundle.privateArtifacts) {
    if (artifact.runId !== runId) {
      errors.push(`private artifact ${artifact.artifactId} has runId ${artifact.runId} but manifest runId is ${runId}`);
    }

    if (!agentIds.has(artifact.agentId)) {
      errors.push(`private artifact ${artifact.artifactId} references unknown agent ${artifact.agentId}`);
    }

    errors.push(...validateCommitmentClaims(artifact.artifactId, artifact.commitmentClaims, artifact.linkedCommitmentIds));

    for (const commitmentId of artifact.linkedCommitmentIds) {
      if (!commitmentIds.has(commitmentId)) {
        errors.push(`private artifact ${artifact.artifactId} references unknown commitment ${commitmentId}`);
      }
    }
  }

  const publicEventIds = new Set(bundle.publicEvents.map((event) => event.eventId));
  const privateArtifactIds = new Set(bundle.privateArtifacts.map((artifact) => artifact.artifactId));

  for (const link of bundle.speechCommitmentLinks) {
    errors.push(
      ...validateSpeechCommitmentLinkRecord(link, {
        runId,
        matchId,
        agentIds,
        commitmentIds,
        publicEventIds,
        privateArtifactIds,
      }),
    );
  }

  for (const divergence of bundle.commitmentDivergences) {
    errors.push(
      ...validateCommitmentDivergenceRecord(divergence, {
        runId,
        matchId,
        agentIds,
        commitmentIds,
        publicEventIds,
        privateArtifactIds,
      }),
    );
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

function validateStructuredCommitmentEnvelope(
  envelope: StructuredCommitmentEnvelope,
  context: {
    runId: string;
    matchId: string;
    agentIds: Set<string>;
    commitmentIds: Set<string>;
  },
): string[] {
  const errors: string[] = [];

  if (envelope.runId !== context.runId) {
    errors.push(
      `commitment envelope ${envelope.envelopeId} has runId ${envelope.runId} but manifest runId is ${context.runId}`,
    );
  }

  if (envelope.matchId !== context.matchId) {
    errors.push(
      `commitment envelope ${envelope.envelopeId} has matchId ${envelope.matchId} but manifest matchId is ${context.matchId}`,
    );
  }

  if (!context.agentIds.has(envelope.agentId)) {
    errors.push(`commitment envelope ${envelope.envelopeId} references unknown agent ${envelope.agentId}`);
  }

  if (envelope.status === 'revealed' && !envelope.revealedAt) {
    errors.push(`commitment envelope ${envelope.envelopeId} is revealed but missing revealedAt`);
  }

  if (envelope.status === 'revoked' && !envelope.revokedAt) {
    errors.push(`commitment envelope ${envelope.envelopeId} is revoked but missing revokedAt`);
  }

  for (const commitment of envelope.commitments) {
    errors.push(...validateStructuredCommitment(commitment, envelope, context.agentIds, context.commitmentIds));
  }

  return errors;
}

function validateStructuredCommitment(
  commitment: StructuredCommitment,
  envelope: StructuredCommitmentEnvelope,
  agentIds: Set<string>,
  commitmentIds: Set<string>,
): string[] {
  const errors: string[] = [];

  if (commitmentIds.has(commitment.commitmentId)) {
    errors.push(`duplicate commitment id ${commitment.commitmentId}`);
  } else {
    commitmentIds.add(commitment.commitmentId);
  }

  if (commitment.agentId !== envelope.agentId) {
    errors.push(`commitment ${commitment.commitmentId} agent ${commitment.agentId} does not match envelope ${envelope.envelopeId}`);
  }

  if (commitment.round !== envelope.round) {
    errors.push(`commitment ${commitment.commitmentId} round ${commitment.round} does not match envelope ${envelope.envelopeId}`);
  }

  if (commitment.status !== envelope.status) {
    errors.push(`commitment ${commitment.commitmentId} status ${commitment.status} does not match envelope ${envelope.envelopeId}`);
  }

  if (commitment.status === 'revealed' && !commitment.revealedAt) {
    errors.push(`commitment ${commitment.commitmentId} is revealed but missing revealedAt`);
  }

  if (commitment.status === 'revoked' && !commitment.revokedAt) {
    errors.push(`commitment ${commitment.commitmentId} is revoked but missing revokedAt`);
  }

  switch (commitment.payload.commitmentType) {
    case 'intended_vote':
    case 'betrayal_target':
    case 'nudge':
      if (!agentIds.has(commitment.payload.targetAgentId)) {
        errors.push(`commitment ${commitment.commitmentId} targets unknown agent ${commitment.payload.targetAgentId}`);
      }
      break;
    case 'ally_set':
      for (const allyAgentId of commitment.payload.allyAgentIds) {
        if (!agentIds.has(allyAgentId)) {
          errors.push(`commitment ${commitment.commitmentId} references unknown ally ${allyAgentId}`);
        }

        if (allyAgentId === commitment.agentId) {
          errors.push(`commitment ${commitment.commitmentId} must not include the committing agent in ally_set`);
        }
      }
      break;
    case 'task_plan':
      for (const collaboratorAgentId of commitment.payload.collaboratorAgentIds) {
        if (!agentIds.has(collaboratorAgentId)) {
          errors.push(`commitment ${commitment.commitmentId} references unknown collaborator ${collaboratorAgentId}`);
        }

        if (collaboratorAgentId === commitment.agentId) {
          errors.push(`commitment ${commitment.commitmentId} must not include the committing agent as a collaborator`);
        }
      }
      break;
    case 'freeze':
      break;
  }

  return errors;
}

function validateCommitmentClaims(
  sourceRecordId: string,
  claims: readonly CommitmentClaim[],
  linkedCommitmentIds: readonly string[],
): string[] {
  const errors: string[] = [];
  const linkedIds = new Set(linkedCommitmentIds);

  for (const claim of claims) {
    if (!linkedIds.has(claim.commitmentId)) {
      errors.push(`record ${sourceRecordId} declares claim for ${claim.commitmentId} without linking that commitment id`);
    }
  }

  return errors;
}

function validateSpeechCommitmentLinkRecord(
  link: SpeechCommitmentLinkRecord,
  context: {
    runId: string;
    matchId: string;
    agentIds: Set<string>;
    commitmentIds: Set<string>;
    publicEventIds: Set<string>;
    privateArtifactIds: Set<string>;
  },
): string[] {
  const errors: string[] = [];

  if (link.runId !== context.runId) {
    errors.push(`speech link ${link.linkId} has runId ${link.runId} but manifest runId is ${context.runId}`);
  }

  if (link.matchId !== context.matchId) {
    errors.push(`speech link ${link.linkId} has matchId ${link.matchId} but manifest matchId is ${context.matchId}`);
  }

  if (!context.agentIds.has(link.agentId)) {
    errors.push(`speech link ${link.linkId} references unknown agent ${link.agentId}`);
  }

  if (!context.commitmentIds.has(link.commitmentId)) {
    errors.push(`speech link ${link.linkId} references unknown commitment ${link.commitmentId}`);
  }

  if (link.sourceKind === 'public_event' && !context.publicEventIds.has(link.sourceRecordId)) {
    errors.push(`speech link ${link.linkId} references unknown public event ${link.sourceRecordId}`);
  }

  if (link.sourceKind === 'private_artifact' && !context.privateArtifactIds.has(link.sourceRecordId)) {
    errors.push(`speech link ${link.linkId} references unknown private artifact ${link.sourceRecordId}`);
  }

  if (link.evidence === 'declared_payload' && !link.declaredPayload) {
    errors.push(`speech link ${link.linkId} requires declaredPayload for evidence type declared_payload`);
  }

  return errors;
}

function validateCommitmentDivergenceRecord(
  divergence: CommitmentDivergenceRecord,
  context: {
    runId: string;
    matchId: string;
    agentIds: Set<string>;
    commitmentIds: Set<string>;
    publicEventIds: Set<string>;
    privateArtifactIds: Set<string>;
  },
): string[] {
  const errors: string[] = [];

  if (divergence.runId !== context.runId) {
    errors.push(`divergence ${divergence.divergenceId} has runId ${divergence.runId} but manifest runId is ${context.runId}`);
  }

  if (divergence.matchId !== context.matchId) {
    errors.push(`divergence ${divergence.divergenceId} has matchId ${divergence.matchId} but manifest matchId is ${context.matchId}`);
  }

  if (!context.agentIds.has(divergence.agentId)) {
    errors.push(`divergence ${divergence.divergenceId} references unknown agent ${divergence.agentId}`);
  }

  if (!context.commitmentIds.has(divergence.commitmentId)) {
    errors.push(`divergence ${divergence.divergenceId} references unknown commitment ${divergence.commitmentId}`);
  }

  for (const sourceRecordId of divergence.sourceRecordIds) {
    const known =
      context.commitmentIds.has(sourceRecordId)
      || context.publicEventIds.has(sourceRecordId)
      || context.privateArtifactIds.has(sourceRecordId);
    if (!known) {
      errors.push(`divergence ${divergence.divergenceId} references unknown source record ${sourceRecordId}`);
    }
  }

  if (divergence.outcome !== 'unknown' && !divergence.observedPayload) {
    errors.push(`divergence ${divergence.divergenceId} must include observedPayload when outcome is ${divergence.outcome}`);
  }

  return errors;
}
