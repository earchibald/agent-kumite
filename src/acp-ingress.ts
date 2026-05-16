import type {
  AcpAwaitOpenedEnvelope,
  AcpAwaitResolvedEnvelope,
  AcpCommitmentSubmittedEnvelope,
  AcpIngressEnvelope,
  AcpPhaseTransitionEnvelope,
  AcpPublicEventEnvelope,
  AwaitRecord,
  InterventionRecord,
  PublicEvent,
  ReplayMarker,
  StructuredCommitmentEnvelope,
} from './schema.js';

export interface NormalizedAcpIngressRecordSet {
  publicEvent?: PublicEvent;
  awaitRecord?: AwaitRecord;
  interventionRecord?: InterventionRecord;
  replayMarker?: ReplayMarker;
  structuredCommitmentEnvelope?: StructuredCommitmentEnvelope;
}

function envelopeRecordId(envelopeId: string, suffix: string): string {
  return `${envelopeId}:${suffix}`;
}

function normalizePhaseTransitionEnvelope(
  envelope: AcpPhaseTransitionEnvelope,
): NormalizedAcpIngressRecordSet {
  return {
    publicEvent: {
      eventId: envelopeRecordId(envelope.envelopeId, 'event'),
      runId: envelope.runId,
      matchId: envelope.matchId,
      cursor: { ...envelope.cursor },
      timestamp: envelope.timestamp,
      kind: 'phase_transition',
      layer: 'public',
      actorAgentIds: [...envelope.payload.actorAgentIds],
      linkedCommitmentIds: [...envelope.payload.linkedCommitmentIds],
      commitmentClaims: envelope.payload.commitmentClaims.map((claim) => ({
        commitmentId: claim.commitmentId,
        payload: claim.payload,
      })),
      payload: {
        fromPhase: envelope.payload.fromPhase,
        toPhase: envelope.payload.toPhase,
        summary: envelope.payload.summary,
        sourceSessionId: envelope.source.sessionId,
        ...(envelope.source.serverId ? { sourceServerId: envelope.source.serverId } : {}),
        ...(envelope.source.messageId ? { sourceMessageId: envelope.source.messageId } : {}),
        ...(envelope.source.agentId ? { sourceAgentId: envelope.source.agentId } : {}),
        ...envelope.payload.metadata,
      },
    },
  };
}

function normalizeAwaitOpenedEnvelope(
  envelope: AcpAwaitOpenedEnvelope,
): NormalizedAcpIngressRecordSet {
  const awaitRecord = envelope.payload.await;

  return {
    awaitRecord: {
      ...awaitRecord,
      scope: {
        ...awaitRecord.scope,
        runId: envelope.runId,
        matchId: envelope.matchId,
        round: envelope.cursor.round,
        phase: envelope.cursor.phase,
      },
      openedAt: envelope.timestamp,
      openedBy: awaitRecord.openedBy,
    },
    interventionRecord: {
      interventionId: envelopeRecordId(envelope.envelopeId, 'intervention'),
      runId: envelope.runId,
      cursor: { ...envelope.cursor },
      layer: 'intervention',
      awaitId: awaitRecord.awaitId,
      kind: awaitRecord.kind,
      status: awaitRecord.status,
      openedAt: envelope.timestamp,
    },
    replayMarker: {
      markerId: envelopeRecordId(envelope.envelopeId, 'marker'),
      runId: envelope.runId,
      cursor: { ...envelope.cursor },
      markerType: 'await_open',
      label: `${awaitRecord.kind}: ${awaitRecord.prompt}`,
      sourceEventIds: [],
      linkedAwaitId: awaitRecord.awaitId,
    },
  };
}

function markerTypeForAwaitResolution(
  _envelope: AcpAwaitResolvedEnvelope,
): ReplayMarker['markerType'] {
  return 'await_resolved';
}

function normalizeAwaitResolvedEnvelope(
  envelope: AcpAwaitResolvedEnvelope,
): NormalizedAcpIngressRecordSet {
  return {
    interventionRecord: {
      interventionId: envelopeRecordId(envelope.envelopeId, 'intervention'),
      runId: envelope.runId,
      cursor: { ...envelope.cursor },
      layer: 'intervention',
      awaitId: envelope.payload.awaitId,
      kind: envelope.payload.kind,
      status: envelope.payload.status,
      ...(envelope.payload.choiceId ? { choiceId: envelope.payload.choiceId } : {}),
      ...(envelope.payload.operatorId ? { operatorId: envelope.payload.operatorId } : {}),
      openedAt: envelope.timestamp,
      resolvedAt: envelope.payload.resolvedAt,
    },
    replayMarker: {
      markerId: envelopeRecordId(envelope.envelopeId, 'marker'),
      runId: envelope.runId,
      cursor: { ...envelope.cursor },
      markerType: markerTypeForAwaitResolution(envelope),
      label: `${envelope.payload.status}: ${envelope.payload.awaitId}`,
      sourceEventIds: [],
      linkedAwaitId: envelope.payload.awaitId,
    },
  };
}

function replayMarkerFromPublicEvent(event: PublicEvent): ReplayMarker | undefined {
  switch (event.kind) {
    case 'vote_reveal':
      return {
        markerId: `marker_${event.eventId}`,
        runId: event.runId,
        cursor: { ...event.cursor },
        markerType: 'reveal',
        label: `Round ${event.cursor.round} votes revealed`,
        sourceEventIds: [event.eventId],
      };
    case 'commitment_reveal':
      return {
        markerId: `marker_${event.eventId}`,
        runId: event.runId,
        cursor: { ...event.cursor },
        markerType: 'reveal',
        label: `Round ${event.cursor.round} commitments revealed`,
        sourceEventIds: [event.eventId],
      };
    case 'elimination':
      return {
        markerId: `marker_${event.eventId}`,
        runId: event.runId,
        cursor: { ...event.cursor },
        markerType: 'elimination',
        label: `Round ${event.cursor.round} elimination: ${event.actorAgentIds.join(', ')}`,
        sourceEventIds: [event.eventId],
      };
    case 'score_delta':
      return {
        markerId: `marker_${event.eventId}`,
        runId: event.runId,
        cursor: { ...event.cursor },
        markerType: 'bookmark',
        label: `Round ${event.cursor.round} scores posted`,
        sourceEventIds: [event.eventId],
      };
    default:
      return undefined;
  }
}

function normalizeCommitmentSubmittedEnvelope(
  envelope: AcpCommitmentSubmittedEnvelope,
): NormalizedAcpIngressRecordSet {
  const commitmentEnvelope = envelope.payload.commitmentEnvelope;
  return {
    structuredCommitmentEnvelope: {
      ...commitmentEnvelope,
      runId: envelope.runId,
      matchId: envelope.matchId,
      round: envelope.cursor.round,
      commitments: commitmentEnvelope.commitments.map((commitment) => ({
        ...commitment,
        round: envelope.cursor.round,
      })),
    },
  };
}

function normalizePublicEventEnvelope(
  envelope: AcpPublicEventEnvelope,
): NormalizedAcpIngressRecordSet {
  const event = envelope.payload.event;
  const publicEvent: PublicEvent = {
    ...event,
    runId: envelope.runId,
    matchId: envelope.matchId,
    cursor: { ...envelope.cursor },
    timestamp: envelope.timestamp,
    actorAgentIds: [...event.actorAgentIds],
    linkedCommitmentIds: [...event.linkedCommitmentIds],
    commitmentClaims: event.commitmentClaims.map((claim) => ({
      commitmentId: claim.commitmentId,
      payload: claim.payload,
    })),
  };
  const replayMarker = replayMarkerFromPublicEvent(publicEvent);

  return {
    publicEvent,
    ...(replayMarker ? { replayMarker } : {}),
  };
}

export function normalizeAcpIngressEnvelope(
  envelope: AcpIngressEnvelope,
): NormalizedAcpIngressRecordSet {
  switch (envelope.kind) {
    case 'phase_transition':
      return normalizePhaseTransitionEnvelope(envelope);
    case 'await_opened':
      return normalizeAwaitOpenedEnvelope(envelope);
    case 'await_resolved':
      return normalizeAwaitResolvedEnvelope(envelope);
    case 'commitment_submitted':
      return normalizeCommitmentSubmittedEnvelope(envelope);
    case 'public_event':
      return normalizePublicEventEnvelope(envelope);
  }
}

export function normalizeAcpIngressEnvelopes(
  envelopes: readonly AcpIngressEnvelope[],
): NormalizedAcpIngressRecordSet[] {
  return envelopes.map((envelope) => normalizeAcpIngressEnvelope(envelope));
}
