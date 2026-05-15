import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import {
  AcpIngressEnvelopeSchema,
  ArtifactBundleSchema,
  AwaitKind,
  AwaitRecordSchema,
  BenchmarkBatchLedgerSchema,
  BenchmarkBatchPlan,
  BenchmarkBatchPlanSchema,
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

export function validateAcpIngressEnvelope(value: unknown): string[] {
  return validateWith(AcpIngressEnvelopeSchema, value);
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

export function validateBenchmarkBatchPlan(value: unknown): string[] {
  const schemaErrors = validateWith(BenchmarkBatchPlanSchema, value);
  if (schemaErrors.length > 0) {
    return schemaErrors;
  }

  const plan = value as BenchmarkBatchPlan;
  const errors: string[] = [];
  const seenConditions = new Set<Condition>();
  for (const condition of plan.conditions) {
    if (seenConditions.has(condition.condition)) {
      errors.push(`duplicate batch condition ${condition.condition}`);
    }
    seenConditions.add(condition.condition);
  }

  const seenOverrides = new Set<string>();
  for (const override of plan.runOverrides ?? []) {
    if (!seenConditions.has(override.condition)) {
      errors.push(`run override references undeclared condition ${override.condition}`);
    }

    const key = `${override.condition}:${override.runSeed}`;
    if (seenOverrides.has(key)) {
      errors.push(`duplicate run override for ${override.condition} seed ${override.runSeed}`);
    }
    seenOverrides.add(key);
  }

  return errors;
}

export function validateBenchmarkBatchLedger(value: unknown): string[] {
  return validateWith(BenchmarkBatchLedgerSchema, value);
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

  if (bundle.benchmarkSummary.runId !== runId) {
    errors.push(`benchmark summary runId ${bundle.benchmarkSummary.runId} does not match manifest runId ${runId}`);
  }

  if (bundle.benchmarkSummary.matchId !== matchId) {
    errors.push(`benchmark summary matchId ${bundle.benchmarkSummary.matchId} does not match manifest matchId ${matchId}`);
  }

  if (bundle.benchmarkSummary.condition !== bundle.manifest.condition) {
    errors.push(
      `benchmark summary condition ${bundle.benchmarkSummary.condition} does not match manifest condition ${bundle.manifest.condition}`,
    );
  }

  if (bundle.benchmarkSummary.runSeed !== bundle.manifest.runSeed) {
    errors.push(`benchmark summary runSeed ${bundle.benchmarkSummary.runSeed} does not match manifest runSeed ${bundle.manifest.runSeed}`);
  }

  if (bundle.benchmarkSummary.validityStatus !== bundle.manifest.validityStatus) {
    errors.push(
      `benchmark summary validityStatus ${bundle.benchmarkSummary.validityStatus} does not match manifest validityStatus ${bundle.manifest.validityStatus}`,
    );
  }

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

  const roundsPlayed = Math.max(...bundle.replayBundle.timeline.map((cursor) => cursor.round));
  if (bundle.benchmarkSummary.roundsPlayed !== roundsPlayed) {
    errors.push(`benchmark summary roundsPlayed ${bundle.benchmarkSummary.roundsPlayed} does not match replay timeline max round ${roundsPlayed}`);
  }

  if (bundle.benchmarkSummary.totals.publicEvents !== bundle.publicEvents.length) {
    errors.push(`benchmark summary publicEvents total ${bundle.benchmarkSummary.totals.publicEvents} does not match actual count ${bundle.publicEvents.length}`);
  }

  if (bundle.benchmarkSummary.totals.privateArtifacts !== bundle.privateArtifacts.length) {
    errors.push(`benchmark summary privateArtifacts total ${bundle.benchmarkSummary.totals.privateArtifacts} does not match actual count ${bundle.privateArtifacts.length}`);
  }

  const structuredCommitmentCount = bundle.structuredCommitments.reduce(
    (count, envelope) => count + envelope.commitments.length,
    0,
  );
  if (bundle.benchmarkSummary.totals.structuredCommitments !== structuredCommitmentCount) {
    errors.push(`benchmark summary structuredCommitments total ${bundle.benchmarkSummary.totals.structuredCommitments} does not match actual count ${structuredCommitmentCount}`);
  }

  if (bundle.benchmarkSummary.totals.speechCommitmentLinks !== bundle.speechCommitmentLinks.length) {
    errors.push(`benchmark summary speechCommitmentLinks total ${bundle.benchmarkSummary.totals.speechCommitmentLinks} does not match actual count ${bundle.speechCommitmentLinks.length}`);
  }

  if (bundle.benchmarkSummary.totals.commitmentDivergences !== bundle.commitmentDivergences.length) {
    errors.push(`benchmark summary commitmentDivergences total ${bundle.benchmarkSummary.totals.commitmentDivergences} does not match actual count ${bundle.commitmentDivergences.length}`);
  }

  if (bundle.benchmarkSummary.totals.replayMarkers !== bundle.replayBundle.markers.length) {
    errors.push(`benchmark summary replayMarkers total ${bundle.benchmarkSummary.totals.replayMarkers} does not match actual count ${bundle.replayBundle.markers.length}`);
  }

  if (bundle.benchmarkSummary.totals.alerts !== bundle.alerts.length) {
    errors.push(`benchmark summary alerts total ${bundle.benchmarkSummary.totals.alerts} does not match actual count ${bundle.alerts.length}`);
  }

  if (bundle.benchmarkSummary.totals.interventions !== bundle.interventions.length) {
    errors.push(`benchmark summary interventions total ${bundle.benchmarkSummary.totals.interventions} does not match actual count ${bundle.interventions.length}`);
  }

  const replayMarkersByType = countByType(bundle.replayBundle.markers.map((marker) => marker.markerType));
  if (JSON.stringify(bundle.benchmarkSummary.replayMarkersByType) !== JSON.stringify(replayMarkersByType)) {
    errors.push('benchmark summary replayMarkersByType does not match actual replay marker distribution');
  }

  const divergenceByOutcome = countByType(bundle.commitmentDivergences.map((record) => record.outcome));
  if (JSON.stringify(bundle.benchmarkSummary.divergenceByOutcome) !== JSON.stringify(divergenceByOutcome)) {
    errors.push('benchmark summary divergenceByOutcome does not match actual divergence distribution');
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

function countByType<T extends string>(values: readonly T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
