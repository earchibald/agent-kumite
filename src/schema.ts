import { Static, Type } from '@sinclair/typebox';

const IdSchema = Type.String({
  minLength: 1,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});

const TimestampSchema = Type.String({
  pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$',
});
const MetadataSchema = Type.Record(Type.String(), Type.Unknown());

export const ConditionSchema = Type.Union(
  [
    Type.Literal('C1'),
    Type.Literal('C2'),
    Type.Literal('C3'),
    Type.Literal('C4'),
    Type.Literal('C4*'),
    Type.Literal('C5'),
  ],
  { $id: 'Condition' },
);
export type Condition = Static<typeof ConditionSchema>;

export const OperatorAffordanceSetSchema = Type.Union(
  [Type.Literal('observation-only'), Type.Literal('intervention-enabled')],
  { $id: 'OperatorAffordanceSet' },
);
export type OperatorAffordanceSet = Static<typeof OperatorAffordanceSetSchema>;

export const RosterModeSchema = Type.Union([Type.Literal('same-model'), Type.Literal('mixed-model')], {
  $id: 'RosterMode',
});
export type RosterMode = Static<typeof RosterModeSchema>;

export const MemoryModeSchema = Type.Union([Type.Literal('off'), Type.Literal('on')], {
  $id: 'MemoryMode',
});
export type MemoryMode = Static<typeof MemoryModeSchema>;

export const MatchRoleSchema = Type.Union(
  [Type.Literal('contender'), Type.Literal('analyst'), Type.Literal('saboteur')],
  { $id: 'MatchRole' },
);
export type MatchRole = Static<typeof MatchRoleSchema>;

export const RoundPhaseSchema = Type.Union(
  [
    Type.Literal('cast_intro'),
    Type.Literal('private_negotiation'),
    Type.Literal('structured_commitment_submission'),
    Type.Literal('public_square'),
    Type.Literal('task_submission'),
    Type.Literal('simultaneous_reveal'),
    Type.Literal('resolution_pressure_escalation'),
    Type.Literal('elimination_aftermath'),
    Type.Literal('task_scoring_debrief'),
  ],
  { $id: 'RoundPhase' },
);
export type RoundPhase = Static<typeof RoundPhaseSchema>;

export const ROUND_PHASE_ORDER: readonly RoundPhase[] = [
  'cast_intro',
  'private_negotiation',
  'structured_commitment_submission',
  'public_square',
  'task_submission',
  'simultaneous_reveal',
  'resolution_pressure_escalation',
  'elimination_aftermath',
  'task_scoring_debrief',
];

export const SurfaceLayerSchema = Type.Union(
  [
    Type.Literal('public'),
    Type.Literal('private'),
    Type.Literal('alert'),
    Type.Literal('intervention'),
  ],
  { $id: 'SurfaceLayer' },
);
export type SurfaceLayer = Static<typeof SurfaceLayerSchema>;

export const AwaitKindSchema = Type.Union(
  [
    Type.Literal('question'),
    Type.Literal('nudge'),
    Type.Literal('approval'),
    Type.Literal('role_change'),
    Type.Literal('freeze'),
    Type.Literal('ejection'),
  ],
  { $id: 'AwaitKind' },
);
export type AwaitKind = Static<typeof AwaitKindSchema>;

export const AwaitStatusSchema = Type.Union(
  [
    Type.Literal('pending'),
    Type.Literal('resolved'),
    Type.Literal('timed_out'),
    Type.Literal('superseded'),
  ],
  { $id: 'AwaitStatus' },
);
export type AwaitStatus = Static<typeof AwaitStatusSchema>;

export const MatchStatusSchema = Type.Union(
  [Type.Literal('setup'), Type.Literal('live'), Type.Literal('paused'), Type.Literal('completed')],
  { $id: 'MatchStatus' },
);
export type MatchStatus = Static<typeof MatchStatusSchema>;

export const PublicEventKindSchema = Type.Union(
  [
    Type.Literal('round_open'),
    Type.Literal('public_utterance'),
    Type.Literal('nomination'),
    Type.Literal('vote_reveal'),
    Type.Literal('commitment_reveal'),
    Type.Literal('elimination'),
    Type.Literal('score_delta'),
    Type.Literal('phase_transition'),
    Type.Literal('replay_marker'),
  ],
  { $id: 'PublicEventKind' },
);
export type PublicEventKind = Static<typeof PublicEventKindSchema>;

export const CommitmentTypeSchema = Type.Union(
  [
    Type.Literal('intended_vote'),
    Type.Literal('ally_set'),
    Type.Literal('betrayal_target'),
    Type.Literal('task_plan'),
    Type.Literal('freeze'),
    Type.Literal('nudge'),
  ],
  { $id: 'CommitmentType' },
);
export type CommitmentType = Static<typeof CommitmentTypeSchema>;

export const CommitmentStatusSchema = Type.Union(
  [Type.Literal('sealed'), Type.Literal('revealed'), Type.Literal('revoked')],
  { $id: 'CommitmentStatus' },
);
export type CommitmentStatus = Static<typeof CommitmentStatusSchema>;

export const PrivateArtifactKindSchema = Type.Union(
  [
    Type.Literal('dm'),
    Type.Literal('analyst_privileged_read'),
    Type.Literal('aftermath_note'),
    Type.Literal('reported_reasoning'),
  ],
  { $id: 'PrivateArtifactKind' },
);
export type PrivateArtifactKind = Static<typeof PrivateArtifactKindSchema>;

export const MarkerTypeSchema = Type.Union(
  [
    Type.Literal('reveal'),
    Type.Literal('elimination'),
    Type.Literal('betrayal'),
    Type.Literal('alert'),
    Type.Literal('await_open'),
    Type.Literal('await_resolved'),
    Type.Literal('bookmark'),
  ],
  { $id: 'MarkerType' },
);
export type MarkerType = Static<typeof MarkerTypeSchema>;

export const ValidityStatusSchema = Type.Union(
  [Type.Literal('valid'), Type.Literal('invalid'), Type.Literal('contaminated')],
  { $id: 'ValidityStatus' },
);
export type ValidityStatus = Static<typeof ValidityStatusSchema>;

export const AlertSeveritySchema = Type.Union(
  [Type.Literal('info'), Type.Literal('warning'), Type.Literal('critical')],
  { $id: 'AlertSeverity' },
);
export type AlertSeverity = Static<typeof AlertSeveritySchema>;

export const AlertStatusSchema = Type.Union(
  [Type.Literal('active'), Type.Literal('acknowledged'), Type.Literal('resolved')],
  { $id: 'AlertStatus' },
);
export type AlertStatus = Static<typeof AlertStatusSchema>;

export const PhaseCursorSchema = Type.Object(
  {
    round: Type.Integer({ minimum: 1, maximum: 5 }),
    phase: RoundPhaseSchema,
  },
  { $id: 'PhaseCursor' },
);
export type PhaseCursor = Static<typeof PhaseCursorSchema>;

export const RunManifestSchema = Type.Object(
  {
    runId: IdSchema,
    matchId: IdSchema,
    condition: ConditionSchema,
    runSeed: Type.Integer({ minimum: 0 }),
    rosterMode: RosterModeSchema,
    memoryMode: MemoryModeSchema,
    operatorAffordanceSet: OperatorAffordanceSetSchema,
    codeRevision: Type.String({ minLength: 7 }),
    validityStatus: ValidityStatusSchema,
    invalidationReason: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: 'RunManifest' },
);
export type RunManifest = Static<typeof RunManifestSchema>;

export const RosterEntrySchema = Type.Object(
  {
    agentId: IdSchema,
    displayName: Type.String({ minLength: 1 }),
    seat: Type.Integer({ minimum: 1, maximum: 6 }),
    role: MatchRoleSchema,
    modelFamily: Type.String({ minLength: 1 }),
    modelVersion: Type.String({ minLength: 1 }),
    memoryEnabled: Type.Boolean(),
  },
  { $id: 'RosterEntry' },
);
export type RosterEntry = Static<typeof RosterEntrySchema>;

export const IntendedVoteCommitmentPayloadSchema = Type.Object(
  {
    commitmentType: Type.Literal('intended_vote'),
    targetAgentId: IdSchema,
    justification: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: 'IntendedVoteCommitmentPayload' },
);
export type IntendedVoteCommitmentPayload = Static<typeof IntendedVoteCommitmentPayloadSchema>;

export const AllySetCommitmentPayloadSchema = Type.Object(
  {
    commitmentType: Type.Literal('ally_set'),
    allyAgentIds: Type.Array(IdSchema, { minItems: 1, maxItems: 5, uniqueItems: true }),
    strength: Type.Union([Type.Literal('soft'), Type.Literal('hard')]),
  },
  { $id: 'AllySetCommitmentPayload' },
);
export type AllySetCommitmentPayload = Static<typeof AllySetCommitmentPayloadSchema>;

export const BetrayalTargetCommitmentPayloadSchema = Type.Object(
  {
    commitmentType: Type.Literal('betrayal_target'),
    targetAgentId: IdSchema,
    rationale: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: 'BetrayalTargetCommitmentPayload' },
);
export type BetrayalTargetCommitmentPayload = Static<typeof BetrayalTargetCommitmentPayloadSchema>;

export const TaskPlanCommitmentPayloadSchema = Type.Object(
  {
    commitmentType: Type.Literal('task_plan'),
    summary: Type.String({ minLength: 1 }),
    collaboratorAgentIds: Type.Array(IdSchema, { maxItems: 5, uniqueItems: true }),
    riskLevel: Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')]),
  },
  { $id: 'TaskPlanCommitmentPayload' },
);
export type TaskPlanCommitmentPayload = Static<typeof TaskPlanCommitmentPayloadSchema>;

export const FreezeCommitmentPayloadSchema = Type.Object(
  {
    commitmentType: Type.Literal('freeze'),
    reason: Type.String({ minLength: 1 }),
  },
  { $id: 'FreezeCommitmentPayload' },
);
export type FreezeCommitmentPayload = Static<typeof FreezeCommitmentPayloadSchema>;

export const NudgeCommitmentPayloadSchema = Type.Object(
  {
    commitmentType: Type.Literal('nudge'),
    targetAgentId: IdSchema,
    prompt: Type.String({ minLength: 1 }),
  },
  { $id: 'NudgeCommitmentPayload' },
);
export type NudgeCommitmentPayload = Static<typeof NudgeCommitmentPayloadSchema>;

export const StructuredCommitmentPayloadSchema = Type.Union(
  [
    IntendedVoteCommitmentPayloadSchema,
    AllySetCommitmentPayloadSchema,
    BetrayalTargetCommitmentPayloadSchema,
    TaskPlanCommitmentPayloadSchema,
    FreezeCommitmentPayloadSchema,
    NudgeCommitmentPayloadSchema,
  ],
  { $id: 'StructuredCommitmentPayload' },
);
export type StructuredCommitmentPayload = Static<typeof StructuredCommitmentPayloadSchema>;

export const StructuredCommitmentSchema = Type.Object(
  {
    commitmentId: IdSchema,
    agentId: IdSchema,
    round: Type.Integer({ minimum: 1, maximum: 5 }),
    status: CommitmentStatusSchema,
    sealedAt: TimestampSchema,
    revealedAt: Type.Optional(TimestampSchema),
    revokedAt: Type.Optional(TimestampSchema),
    linkedEventIds: Type.Array(IdSchema, { uniqueItems: true }),
    payload: StructuredCommitmentPayloadSchema,
  },
  { $id: 'StructuredCommitment' },
);
export type StructuredCommitment = Static<typeof StructuredCommitmentSchema>;

export const StructuredCommitmentEnvelopeSchema = Type.Object(
  {
    envelopeId: IdSchema,
    runId: IdSchema,
    matchId: IdSchema,
    agentId: IdSchema,
    round: Type.Integer({ minimum: 1, maximum: 5 }),
    artifactNumber: Type.Literal(5),
    revealPhase: Type.Literal('simultaneous_reveal'),
    status: CommitmentStatusSchema,
    sealedAt: TimestampSchema,
    revealedAt: Type.Optional(TimestampSchema),
    revokedAt: Type.Optional(TimestampSchema),
    commitments: Type.Array(StructuredCommitmentSchema, { minItems: 1 }),
  },
  { $id: 'StructuredCommitmentEnvelope' },
);
export type StructuredCommitmentEnvelope = Static<typeof StructuredCommitmentEnvelopeSchema>;

export const CommitmentClaimSchema = Type.Object(
  {
    commitmentId: IdSchema,
    payload: StructuredCommitmentPayloadSchema,
  },
  { $id: 'CommitmentClaim' },
);
export type CommitmentClaim = Static<typeof CommitmentClaimSchema>;

export const LayerCollectionsSchema = Type.Object(
  {
    publicEventIds: Type.Array(IdSchema),
    privateArtifactIds: Type.Array(IdSchema),
    alertIds: Type.Array(IdSchema),
    interventionQueueIds: Type.Array(IdSchema),
  },
  { $id: 'LayerCollections' },
);
export type LayerCollections = Static<typeof LayerCollectionsSchema>;

export const MatchStateSchema = Type.Object(
  {
    runId: IdSchema,
    matchId: IdSchema,
    condition: ConditionSchema,
    status: MatchStatusSchema,
    current: PhaseCursorSchema,
    aliveAgentIds: Type.Array(IdSchema, { minItems: 1, maxItems: 6, uniqueItems: true }),
    eliminatedAgentIds: Type.Array(IdSchema, { maxItems: 5, uniqueItems: true }),
    dmBudgetByAgent: Type.Record(IdSchema, Type.Integer({ minimum: 0, maximum: 5 })),
    scoreByAgent: Type.Record(IdSchema, Type.Integer()),
    openAwaitIds: Type.Array(IdSchema, { uniqueItems: true }),
    layers: LayerCollectionsSchema,
    structuredCommitments: Type.Array(StructuredCommitmentEnvelopeSchema),
  },
  { $id: 'MatchState' },
);
export type MatchState = Static<typeof MatchStateSchema>;

export const PublicEventSchema = Type.Object(
  {
    eventId: IdSchema,
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    timestamp: TimestampSchema,
    kind: PublicEventKindSchema,
    layer: Type.Literal('public'),
    actorAgentIds: Type.Array(IdSchema, { uniqueItems: true }),
    linkedCommitmentIds: Type.Array(IdSchema, { uniqueItems: true }),
    commitmentClaims: Type.Array(CommitmentClaimSchema),
    payload: MetadataSchema,
  },
  { $id: 'PublicEvent' },
);
export type PublicEvent = Static<typeof PublicEventSchema>;

export const PrivateArtifactRefSchema = Type.Object(
  {
    artifactId: IdSchema,
    runId: IdSchema,
    agentId: IdSchema,
    cursor: PhaseCursorSchema,
    kind: PrivateArtifactKindSchema,
    timestamp: TimestampSchema,
    linkedEventIds: Type.Array(IdSchema, { uniqueItems: true }),
    linkedCommitmentIds: Type.Array(IdSchema, { uniqueItems: true }),
    commitmentClaims: Type.Array(CommitmentClaimSchema),
  },
  { $id: 'PrivateArtifactRef' },
);
export type PrivateArtifactRef = Static<typeof PrivateArtifactRefSchema>;

export const LinkSourceKindSchema = Type.Union(
  [Type.Literal('public_event'), Type.Literal('private_artifact')],
  { $id: 'LinkSourceKind' },
);
export type LinkSourceKind = Static<typeof LinkSourceKindSchema>;

export const DivergenceComparisonSchema = Type.Union(
  [Type.Literal('speech_vs_commitment'), Type.Literal('commitment_vs_reveal')],
  { $id: 'DivergenceComparison' },
);
export type DivergenceComparison = Static<typeof DivergenceComparisonSchema>;

export const DivergenceOutcomeSchema = Type.Union(
  [Type.Literal('aligned'), Type.Literal('divergent'), Type.Literal('unknown')],
  { $id: 'DivergenceOutcome' },
);
export type DivergenceOutcome = Static<typeof DivergenceOutcomeSchema>;

export const SpeechCommitmentLinkRecordSchema = Type.Object(
  {
    linkId: IdSchema,
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    layer: Type.Union([Type.Literal('public'), Type.Literal('private')]),
    sourceRecordId: IdSchema,
    sourceKind: LinkSourceKindSchema,
    agentId: IdSchema,
    commitmentId: IdSchema,
    commitmentType: CommitmentTypeSchema,
    evaluation: DivergenceOutcomeSchema,
    evidence: Type.Union([Type.Literal('declared_payload'), Type.Literal('linked_only')]),
    summary: Type.String({ minLength: 1 }),
    declaredPayload: Type.Optional(StructuredCommitmentPayloadSchema),
  },
  { $id: 'SpeechCommitmentLinkRecord' },
);
export type SpeechCommitmentLinkRecord = Static<typeof SpeechCommitmentLinkRecordSchema>;

export const CommitmentDivergenceRecordSchema = Type.Object(
  {
    divergenceId: IdSchema,
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    agentId: IdSchema,
    commitmentId: IdSchema,
    commitmentType: CommitmentTypeSchema,
    comparison: DivergenceComparisonSchema,
    outcome: DivergenceOutcomeSchema,
    sourceRecordIds: Type.Array(IdSchema, { minItems: 1, uniqueItems: true }),
    summary: Type.String({ minLength: 1 }),
    expectedPayload: StructuredCommitmentPayloadSchema,
    observedPayload: Type.Optional(StructuredCommitmentPayloadSchema),
  },
  { $id: 'CommitmentDivergenceRecord' },
);
export type CommitmentDivergenceRecord = Static<typeof CommitmentDivergenceRecordSchema>;

export const AlertRecordSchema = Type.Object(
  {
    alertId: IdSchema,
    runId: IdSchema,
    cursor: PhaseCursorSchema,
    layer: Type.Literal('alert'),
    sourceLayer: SurfaceLayerSchema,
    severity: AlertSeveritySchema,
    status: AlertStatusSchema,
    message: Type.String({ minLength: 1 }),
    sourceRecordIds: Type.Array(IdSchema, { minItems: 1, uniqueItems: true }),
  },
  { $id: 'AlertRecord' },
);
export type AlertRecord = Static<typeof AlertRecordSchema>;

export const AwaitScopeSchema = Type.Object(
  {
    matchId: IdSchema,
    runId: IdSchema,
    round: Type.Integer({ minimum: 1, maximum: 5 }),
    phase: RoundPhaseSchema,
    targetAgentIds: Type.Array(IdSchema, { uniqueItems: true }),
  },
  { $id: 'AwaitScope' },
);
export type AwaitScope = Static<typeof AwaitScopeSchema>;

export const AwaitChoiceSchema = Type.Object(
  {
    choiceId: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    inputSchema: Type.Optional(MetadataSchema),
  },
  { $id: 'AwaitChoice' },
);
export type AwaitChoice = Static<typeof AwaitChoiceSchema>;

export const AwaitRecordSchema = Type.Object(
  {
    awaitId: IdSchema,
    kind: AwaitKindSchema,
    layer: Type.Literal('intervention'),
    status: AwaitStatusSchema,
    scope: AwaitScopeSchema,
    prompt: Type.String({ minLength: 1 }),
    details: Type.Object({
      summary: Type.String({ minLength: 1 }),
      proposedEffect: Type.String({ minLength: 1 }),
      artifacts: Type.Array(IdSchema),
      context: MetadataSchema,
    }),
    choices: Type.Array(AwaitChoiceSchema, { minItems: 1 }),
    defaultChoice: Type.Optional(Type.String({ minLength: 1 })),
    openedAt: TimestampSchema,
    openedBy: Type.String({ minLength: 1 }),
    idempotencyKey: Type.String({ minLength: 1 }),
  },
  { $id: 'AwaitRecord' },
);
export type AwaitRecord = Static<typeof AwaitRecordSchema>;

export const InterventionRecordSchema = Type.Object(
  {
    interventionId: IdSchema,
    runId: IdSchema,
    cursor: PhaseCursorSchema,
    layer: Type.Literal('intervention'),
    awaitId: IdSchema,
    kind: AwaitKindSchema,
    status: AwaitStatusSchema,
    choiceId: Type.Optional(Type.String({ minLength: 1 })),
    operatorId: Type.Optional(Type.String({ minLength: 1 })),
    openedAt: TimestampSchema,
    resolvedAt: Type.Optional(TimestampSchema),
  },
  { $id: 'InterventionRecord' },
);
export type InterventionRecord = Static<typeof InterventionRecordSchema>;

export const AcpIngressSourceSchema = Type.Object(
  {
    sessionId: IdSchema,
    serverId: Type.Optional(IdSchema),
    agentId: Type.Optional(IdSchema),
    messageId: Type.Optional(IdSchema),
  },
  { $id: 'AcpIngressSource' },
);
export type AcpIngressSource = Static<typeof AcpIngressSourceSchema>;

export const AcpPhaseTransitionPayloadSchema = Type.Object(
  {
    fromPhase: RoundPhaseSchema,
    toPhase: RoundPhaseSchema,
    actorAgentIds: Type.Array(IdSchema, { uniqueItems: true }),
    linkedCommitmentIds: Type.Array(IdSchema, { uniqueItems: true }),
    commitmentClaims: Type.Array(CommitmentClaimSchema),
    summary: Type.String({ minLength: 1 }),
    metadata: MetadataSchema,
  },
  { $id: 'AcpPhaseTransitionPayload' },
);
export type AcpPhaseTransitionPayload = Static<typeof AcpPhaseTransitionPayloadSchema>;

export const AcpAwaitOpenedPayloadSchema = Type.Object(
  {
    await: AwaitRecordSchema,
  },
  { $id: 'AcpAwaitOpenedPayload' },
);
export type AcpAwaitOpenedPayload = Static<typeof AcpAwaitOpenedPayloadSchema>;

export const AcpAwaitResolvedPayloadSchema = Type.Object(
  {
    awaitId: IdSchema,
    kind: AwaitKindSchema,
    status: AwaitStatusSchema,
    choiceId: Type.Optional(Type.String({ minLength: 1 })),
    operatorId: Type.Optional(Type.String({ minLength: 1 })),
    resolvedAt: TimestampSchema,
  },
  { $id: 'AcpAwaitResolvedPayload' },
);
export type AcpAwaitResolvedPayload = Static<typeof AcpAwaitResolvedPayloadSchema>;

export const AcpCommitmentSubmittedPayloadSchema = Type.Object(
  {
    commitmentEnvelope: StructuredCommitmentEnvelopeSchema,
  },
  { $id: 'AcpCommitmentSubmittedPayload' },
);
export type AcpCommitmentSubmittedPayload = Static<typeof AcpCommitmentSubmittedPayloadSchema>;

export const AcpPublicEventPayloadSchema = Type.Object(
  {
    event: PublicEventSchema,
  },
  { $id: 'AcpPublicEventPayload' },
);
export type AcpPublicEventPayload = Static<typeof AcpPublicEventPayloadSchema>;

export const AcpPhaseTransitionEnvelopeSchema = Type.Object(
  {
    envelopeId: IdSchema,
    kind: Type.Literal('phase_transition'),
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    timestamp: TimestampSchema,
    source: AcpIngressSourceSchema,
    payload: AcpPhaseTransitionPayloadSchema,
  },
  { $id: 'AcpPhaseTransitionEnvelope' },
);
export type AcpPhaseTransitionEnvelope = Static<typeof AcpPhaseTransitionEnvelopeSchema>;

export const AcpAwaitOpenedEnvelopeSchema = Type.Object(
  {
    envelopeId: IdSchema,
    kind: Type.Literal('await_opened'),
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    timestamp: TimestampSchema,
    source: AcpIngressSourceSchema,
    payload: AcpAwaitOpenedPayloadSchema,
  },
  { $id: 'AcpAwaitOpenedEnvelope' },
);
export type AcpAwaitOpenedEnvelope = Static<typeof AcpAwaitOpenedEnvelopeSchema>;

export const AcpAwaitResolvedEnvelopeSchema = Type.Object(
  {
    envelopeId: IdSchema,
    kind: Type.Literal('await_resolved'),
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    timestamp: TimestampSchema,
    source: AcpIngressSourceSchema,
    payload: AcpAwaitResolvedPayloadSchema,
  },
  { $id: 'AcpAwaitResolvedEnvelope' },
);
export type AcpAwaitResolvedEnvelope = Static<typeof AcpAwaitResolvedEnvelopeSchema>;

export const AcpCommitmentSubmittedEnvelopeSchema = Type.Object(
  {
    envelopeId: IdSchema,
    kind: Type.Literal('commitment_submitted'),
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    timestamp: TimestampSchema,
    source: AcpIngressSourceSchema,
    payload: AcpCommitmentSubmittedPayloadSchema,
  },
  { $id: 'AcpCommitmentSubmittedEnvelope' },
);
export type AcpCommitmentSubmittedEnvelope = Static<typeof AcpCommitmentSubmittedEnvelopeSchema>;

export const AcpPublicEventEnvelopeSchema = Type.Object(
  {
    envelopeId: IdSchema,
    kind: Type.Literal('public_event'),
    runId: IdSchema,
    matchId: IdSchema,
    cursor: PhaseCursorSchema,
    timestamp: TimestampSchema,
    source: AcpIngressSourceSchema,
    payload: AcpPublicEventPayloadSchema,
  },
  { $id: 'AcpPublicEventEnvelope' },
);
export type AcpPublicEventEnvelope = Static<typeof AcpPublicEventEnvelopeSchema>;

export const AcpIngressEnvelopeSchema = Type.Union(
  [
    AcpPhaseTransitionEnvelopeSchema,
    AcpAwaitOpenedEnvelopeSchema,
    AcpAwaitResolvedEnvelopeSchema,
    AcpCommitmentSubmittedEnvelopeSchema,
    AcpPublicEventEnvelopeSchema,
  ],
  { $id: 'AcpIngressEnvelope' },
);
export type AcpIngressEnvelope = Static<typeof AcpIngressEnvelopeSchema>;

export const ReplayStateSchema = Type.Object(
  {
    cursor: PhaseCursorSchema,
    aliveAgentIds: Type.Array(IdSchema, { minItems: 1, maxItems: 6, uniqueItems: true }),
    eliminatedAgentIds: Type.Array(IdSchema, { maxItems: 5, uniqueItems: true }),
    scoreByAgent: Type.Record(IdSchema, Type.Integer()),
    openAwaitIds: Type.Array(IdSchema, { uniqueItems: true }),
  },
  { $id: 'ReplayState' },
);
export type ReplayState = Static<typeof ReplayStateSchema>;

export const ReplaySnapshotSchema = Type.Object(
  {
    snapshotId: IdSchema,
    runId: IdSchema,
    cursor: PhaseCursorSchema,
    capturedAt: TimestampSchema,
    state: ReplayStateSchema,
  },
  { $id: 'ReplaySnapshot' },
);
export type ReplaySnapshot = Static<typeof ReplaySnapshotSchema>;

export const ReplayMarkerSchema = Type.Object(
  {
    markerId: IdSchema,
    runId: IdSchema,
    cursor: PhaseCursorSchema,
    markerType: MarkerTypeSchema,
    label: Type.String({ minLength: 1 }),
    sourceEventIds: Type.Array(IdSchema, { uniqueItems: true }),
    linkedAwaitId: Type.Optional(IdSchema),
  },
  { $id: 'ReplayMarker' },
);
export type ReplayMarker = Static<typeof ReplayMarkerSchema>;

export const BenchmarkSummarySchema = Type.Object(
  {
    runId: IdSchema,
    matchId: IdSchema,
    condition: ConditionSchema,
    runSeed: Type.Integer({ minimum: 0 }),
    validityStatus: ValidityStatusSchema,
    roundsPlayed: Type.Integer({ minimum: 1, maximum: 5 }),
    winnerIds: Type.Array(IdSchema, { uniqueItems: true }),
    eliminatedAgentIds: Type.Array(IdSchema, { uniqueItems: true }),
    totals: Type.Object({
      publicEvents: Type.Integer({ minimum: 0 }),
      privateArtifacts: Type.Integer({ minimum: 0 }),
      structuredCommitments: Type.Integer({ minimum: 0 }),
      speechCommitmentLinks: Type.Integer({ minimum: 0 }),
      commitmentDivergences: Type.Integer({ minimum: 0 }),
      replayMarkers: Type.Integer({ minimum: 0 }),
      alerts: Type.Integer({ minimum: 0 }),
      interventions: Type.Integer({ minimum: 0 }),
    }),
    replayMarkersByType: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
    divergenceByOutcome: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
    highlightLabels: Type.Array(Type.String({ minLength: 1 })),
  },
  { $id: 'BenchmarkSummary' },
);
export type BenchmarkSummary = Static<typeof BenchmarkSummarySchema>;

export const BenchmarkBatchConditionPlanSchema = Type.Object(
  {
    condition: ConditionSchema,
    inputPath: Type.String({ minLength: 1 }),
  },
  { $id: 'BenchmarkBatchConditionPlan' },
);
export type BenchmarkBatchConditionPlan = Static<typeof BenchmarkBatchConditionPlanSchema>;

export const BenchmarkBatchRunOverrideSchema = Type.Object(
  {
    condition: ConditionSchema,
    runSeed: Type.Integer({ minimum: 0 }),
    inputPath: Type.Optional(Type.String({ minLength: 1 })),
    validityStatus: Type.Optional(ValidityStatusSchema),
    invalidationReason: Type.Optional(Type.String({ minLength: 1 })),
    codeRevision: Type.Optional(Type.String({ minLength: 7 })),
  },
  { $id: 'BenchmarkBatchRunOverride' },
);
export type BenchmarkBatchRunOverride = Static<typeof BenchmarkBatchRunOverrideSchema>;

export const BenchmarkBatchPlanSchema = Type.Object(
  {
    batchId: IdSchema,
    seedLedger: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, uniqueItems: true }),
    targetMatchedSeedCount: Type.Integer({ minimum: 1 }),
    conditions: Type.Array(BenchmarkBatchConditionPlanSchema, { minItems: 1 }),
    runOverrides: Type.Optional(Type.Array(BenchmarkBatchRunOverrideSchema)),
  },
  { $id: 'BenchmarkBatchPlan' },
);
export type BenchmarkBatchPlan = Static<typeof BenchmarkBatchPlanSchema>;

export const BenchmarkBatchRunRecordSchema = Type.Object(
  {
    runId: IdSchema,
    matchId: IdSchema,
    condition: ConditionSchema,
    runSeed: Type.Integer({ minimum: 0 }),
    validityStatus: ValidityStatusSchema,
    invalidationReason: Type.Optional(Type.String({ minLength: 1 })),
    selectedForMatrix: Type.Boolean(),
    inputPath: Type.String({ minLength: 1 }),
    outputDir: Type.String({ minLength: 1 }),
    artifactPath: Type.String({ minLength: 1 }),
    reportPath: Type.String({ minLength: 1 }),
    benchmarkSummaryPath: Type.String({ minLength: 1 }),
  },
  { $id: 'BenchmarkBatchRunRecord' },
);
export type BenchmarkBatchRunRecord = Static<typeof BenchmarkBatchRunRecordSchema>;

export const BenchmarkBatchLedgerSchema = Type.Object(
  {
    batchId: IdSchema,
    declaredConditions: Type.Array(ConditionSchema, { minItems: 1 }),
    declaredSeedLedger: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, uniqueItems: true }),
    targetMatchedSeedCount: Type.Integer({ minimum: 1 }),
    fullyMatchedSeeds: Type.Array(Type.Integer({ minimum: 0 }), { uniqueItems: true }),
    selectedSeeds: Type.Array(Type.Integer({ minimum: 0 }), { uniqueItems: true }),
    targetReached: Type.Boolean(),
    executedRunCount: Type.Integer({ minimum: 0 }),
    matrixInputPaths: Type.Array(Type.String({ minLength: 1 })),
    runs: Type.Array(BenchmarkBatchRunRecordSchema),
  },
  { $id: 'BenchmarkBatchLedger' },
);
export type BenchmarkBatchLedger = Static<typeof BenchmarkBatchLedgerSchema>;

export const ReplayBundleSchema = Type.Object(
  {
    runId: IdSchema,
    timeline: Type.Array(PhaseCursorSchema, { minItems: 1 }),
    snapshots: Type.Array(ReplaySnapshotSchema),
    markers: Type.Array(ReplayMarkerSchema),
  },
  { $id: 'ReplayBundle' },
);
export type ReplayBundle = Static<typeof ReplayBundleSchema>;

export const TaskOutputRefSchema = Type.Object(
  {
    submissionId: IdSchema,
    runId: IdSchema,
    agentId: IdSchema,
    round: Type.Integer({ minimum: 1, maximum: 5 }),
    rubricId: IdSchema,
    finalScore: Type.Integer({ minimum: 0, maximum: 3 }),
  },
  { $id: 'TaskOutputRef' },
);
export type TaskOutputRef = Static<typeof TaskOutputRefSchema>;

export const FinalScoreRowSchema = Type.Object(
  {
    agentId: IdSchema,
    roundDeltas: Type.Array(Type.Integer(), { minItems: 1, maxItems: 5 }),
    total: Type.Integer(),
    winnerShare: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { $id: 'FinalScoreRow' },
);
export type FinalScoreRow = Static<typeof FinalScoreRowSchema>;

export const ArtifactBundleSchema = Type.Object(
  {
    manifest: RunManifestSchema,
    replayBundle: ReplayBundleSchema,
    benchmarkSummary: BenchmarkSummarySchema,
    roster: Type.Array(RosterEntrySchema, { minItems: 6, maxItems: 6 }),
    publicEvents: Type.Array(PublicEventSchema),
    structuredCommitments: Type.Array(StructuredCommitmentEnvelopeSchema),
    privateArtifacts: Type.Array(PrivateArtifactRefSchema),
    speechCommitmentLinks: Type.Array(SpeechCommitmentLinkRecordSchema),
    commitmentDivergences: Type.Array(CommitmentDivergenceRecordSchema),
    alerts: Type.Array(AlertRecordSchema),
    interventions: Type.Array(InterventionRecordSchema),
    taskOutputs: Type.Array(TaskOutputRefSchema),
    finalScores: Type.Array(FinalScoreRowSchema, { minItems: 1, maxItems: 6 }),
  },
  { $id: 'ArtifactBundle' },
);
export type ArtifactBundle = Static<typeof ArtifactBundleSchema>;

export const PersistedAcpIngressReducerStateSchema = Type.Object(
  {
    matchState: MatchStateSchema,
    awaitRecords: Type.Array(AwaitRecordSchema),
    publicEvents: Type.Array(PublicEventSchema),
    interventions: Type.Array(InterventionRecordSchema),
    markers: Type.Array(ReplayMarkerSchema),
    snapshots: Type.Array(ReplaySnapshotSchema),
    replayBundle: ReplayBundleSchema,
  },
  { $id: 'PersistedAcpIngressReducerState' },
);
export type PersistedAcpIngressReducerState = Static<typeof PersistedAcpIngressReducerStateSchema>;

export const AcpLiveRunStoreSchema = Type.Object(
  {
    manifest: RunManifestSchema,
    roster: Type.Array(RosterEntrySchema, { minItems: 6, maxItems: 6 }),
    state: PersistedAcpIngressReducerStateSchema,
  },
  { $id: 'AcpLiveRunStore' },
);
export type PersistedAcpLiveRunStore = Static<typeof AcpLiveRunStoreSchema>;

export const RuntimeSchemas = {
  AcpLiveRunStoreSchema,
  AlertRecordSchema,
  ArtifactBundleSchema,
  AwaitRecordSchema,
  BenchmarkSummarySchema,
  BenchmarkBatchConditionPlanSchema,
  BenchmarkBatchLedgerSchema,
  BenchmarkBatchPlanSchema,
  BenchmarkBatchRunOverrideSchema,
  BenchmarkBatchRunRecordSchema,
  CommitmentClaimSchema,
  CommitmentDivergenceRecordSchema,
  ConditionSchema,
  DivergenceComparisonSchema,
  DivergenceOutcomeSchema,
  FinalScoreRowSchema,
  InterventionRecordSchema,
  LinkSourceKindSchema,
  MatchStateSchema,
  PhaseCursorSchema,
  PersistedAcpIngressReducerStateSchema,
  PublicEventSchema,
  ReplayBundleSchema,
  ReplayMarkerSchema,
  ReplaySnapshotSchema,
  RosterEntrySchema,
  RunManifestSchema,
  SpeechCommitmentLinkRecordSchema,
  StructuredCommitmentEnvelopeSchema,
  StructuredCommitmentSchema,
  TaskOutputRefSchema,
} as const;
