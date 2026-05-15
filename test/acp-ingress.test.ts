import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  normalizeAcpIngressEnvelope,
  normalizeAcpIngressEnvelopes,
  validateAcpIngressEnvelope,
  type AcpIngressEnvelope,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('ACP ingress normalization', () => {
  const fixture = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');

  it('validates the ACP ingress fixture envelopes', () => {
    for (const envelope of fixture) {
      expect(validateAcpIngressEnvelope(envelope)).toEqual([]);
    }
  });

  it('normalizes phase transitions into public events', () => {
    const normalized = normalizeAcpIngressEnvelope(fixture[0]!);

    expect(normalized.publicEvent).toMatchObject({
      eventId: 'acp_env_r3_phase_open:event',
      kind: 'phase_transition',
      runId: 'run_demo_c5_seed_0001',
      matchId: 'match_demo_seed_0001',
      cursor: { round: 3, phase: 'public_square' },
    });
    expect(normalized.publicEvent?.payload).toMatchObject({
      fromPhase: 'structured_commitment_submission',
      toPhase: 'public_square',
      summary: 'Entered public square for round 3.',
      sourceSessionId: 'session_referee_1',
      transitionReason: 'round_loop_advance',
    });
  });

  it('normalizes await open and resolve envelopes into canonical records', () => {
    const normalized = normalizeAcpIngressEnvelopes(fixture);

    expect(normalized[1]?.awaitRecord).toMatchObject({
      awaitId: 'await_r3_task_approval',
      kind: 'approval',
      status: 'pending',
      scope: {
        runId: 'run_demo_c5_seed_0001',
        matchId: 'match_demo_seed_0001',
        round: 3,
        phase: 'task_submission',
      },
    });
    expect(normalized[1]?.interventionRecord).toMatchObject({
      awaitId: 'await_r3_task_approval',
      kind: 'approval',
      status: 'pending',
    });
    expect(normalized[1]?.replayMarker).toMatchObject({
      markerType: 'await_open',
      linkedAwaitId: 'await_r3_task_approval',
    });

    expect(normalized[2]?.interventionRecord).toMatchObject({
      awaitId: 'await_r3_task_approval',
      kind: 'approval',
      status: 'resolved',
      choiceId: 'approve',
      operatorId: 'operator-1',
    });
    expect(normalized[2]?.replayMarker).toMatchObject({
      markerType: 'await_resolved',
      linkedAwaitId: 'await_r3_task_approval',
    });
  });
});
