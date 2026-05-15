import {
  appendAcpIngressEnvelope,
  appendAcpIngressEnvelopes,
  createAcpIngressReducerState,
  type AcpIngressReducerState,
} from './acp-ingress-reducer.js';
import { createLiveControlRoomProjection, type LiveControlRoomProjection } from './projection.js';
import type { AcpIngressEnvelope, MatchState, RosterEntry, RunManifest } from './schema.js';

export interface CreateAcpLiveRunStoreInput {
  manifest: RunManifest;
  roster: readonly RosterEntry[];
  initialTimestamp?: string;
}

export interface AcpLiveRunStore {
  manifest: RunManifest;
  roster: readonly RosterEntry[];
  state: AcpIngressReducerState;
}

export function createAcpLiveRunStore(
  input: CreateAcpLiveRunStoreInput,
): AcpLiveRunStore {
  return {
    manifest: input.manifest,
    roster: [...input.roster],
    state: createAcpIngressReducerState({
      manifest: input.manifest,
      roster: input.roster,
      ...(input.initialTimestamp ? { initialTimestamp: input.initialTimestamp } : {}),
    }),
  };
}

export function appendAcpIngressEnvelopeToRunStore(
  store: AcpLiveRunStore,
  envelope: AcpIngressEnvelope,
): AcpLiveRunStore {
  return {
    ...store,
    state: appendAcpIngressEnvelope(store.state, envelope),
  };
}

export function appendAcpIngressEnvelopesToRunStore(
  store: AcpLiveRunStore,
  envelopes: readonly AcpIngressEnvelope[],
): AcpLiveRunStore {
  return {
    ...store,
    state: appendAcpIngressEnvelopes(store.state, envelopes),
  };
}

export function currentAcpLiveMatchState(store: AcpLiveRunStore): MatchState {
  return store.state.matchState;
}

export function currentAcpLiveControlRoomProjection(
  store: AcpLiveRunStore,
): LiveControlRoomProjection {
  return createLiveControlRoomProjection({
    manifest: store.manifest,
    roster: store.roster,
    reduced: store.state,
  });
}
