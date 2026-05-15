import type {
  AcpAwaitOpenedEnvelope,
  AcpAwaitResolvedEnvelope,
  AcpIngressEnvelope,
  AcpPhaseTransitionEnvelope,
  AwaitRecord,
  InterventionRecord,
  PublicEvent,
  ReplayMarker,
} from './schema.js';

export interface NormalizedAcpIngressRecordSet {
  publicEvent?: PublicEvent;
  awaitRecord?: AwaitRecord;
  interventionRecord?: InterventionRecord;
  replayMarker?: ReplayMarker;
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
      kind: 'approval',
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
  }
}

export function normalizeAcpIngressEnvelopes(
  envelopes: readonly AcpIngressEnvelope[],
): NormalizedAcpIngressRecordSet[] {
  return envelopes.map((envelope) => normalizeAcpIngressEnvelope(envelope));
}
