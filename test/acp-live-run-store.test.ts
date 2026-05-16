import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  appendAcpIngressEnvelopeToRunStore,
  appendAcpIngressEnvelopesToRunStore,
  createAcpLiveRunStore,
  createLiveControlRoomProjection,
  reduceAcpIngressEnvelopes,
  currentAcpLiveControlRoomProjection,
  currentAcpLiveMatchState,
  type AcpIngressEnvelope,
  type DeterministicRunnerInput,
} from '../src/index.ts';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('ACP live run store', () => {
  const envelopes = readFixture<AcpIngressEnvelope[]>('acp-ingress.sequence.c5.json');
  const runnerFixture = readFixture<DeterministicRunnerInput>('demo-match.input.json');
  const manifest = {
    ...runnerFixture.manifest,
    runId: 'run_demo_c5_seed_0001',
    matchId: 'match_demo_seed_0001',
    condition: 'C5' as const,
    operatorAffordanceSet: 'intervention-enabled' as const,
  };

  it('seeds its initial replay state to the first live ingress round', () => {
    const [firstEnvelope] = envelopes;
    if (!firstEnvelope) {
      throw new Error('expected ACP ingress fixture to contain at least one envelope');
    }

    const store = appendAcpIngressEnvelopeToRunStore(
      createAcpLiveRunStore({
        manifest,
        roster: runnerFixture.roster,
      }),
      firstEnvelope,
    );

    expect(store.state.snapshots[0]?.cursor).toEqual({ round: 3, phase: 'cast_intro' });
    expect(store.state.replayBundle.timeline).toEqual([
      { round: 3, phase: 'cast_intro' },
      { round: 3, phase: 'public_square' },
    ]);
  });

  it('matches batch reduction when envelopes are appended one at a time', () => {
    const store = envelopes.reduce(
      (nextStore, envelope) => appendAcpIngressEnvelopeToRunStore(nextStore, envelope),
      createAcpLiveRunStore({
        manifest,
        roster: runnerFixture.roster,
      }),
    );
    const reduced = reduceAcpIngressEnvelopes({
      manifest,
      roster: runnerFixture.roster,
      envelopes,
    });

    expect(store.state).toEqual(reduced);
    expect(currentAcpLiveMatchState(store)).toEqual(reduced.matchState);
  });

  it('matches the direct live projection when envelopes are appended in bulk', () => {
    const store = appendAcpIngressEnvelopesToRunStore(
      createAcpLiveRunStore({
        manifest,
        roster: runnerFixture.roster,
      }),
      envelopes,
    );
    const reduced = reduceAcpIngressEnvelopes({
      manifest,
      roster: runnerFixture.roster,
      envelopes,
    });
    const projection = currentAcpLiveControlRoomProjection(store);
    const directProjection = createLiveControlRoomProjection({
      manifest,
      roster: runnerFixture.roster,
      reduced,
    });

    expect(projection).toEqual(directProjection);
    expect(projection.home.currentCursor).toEqual({ round: 3, phase: 'task_submission' });
  });
});
