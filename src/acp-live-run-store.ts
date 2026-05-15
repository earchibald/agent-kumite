import {
  appendAcpIngressEnvelope,
  appendAcpIngressEnvelopes,
  createAcpIngressReducerState,
  type AcpIngressReducerState,
} from './acp-ingress-reducer.js';
import { createLiveControlRoomProjection, type LiveControlRoomProjection } from './projection.js';
import type {
  AcpIngressEnvelope,
  MatchState,
  PersistedAcpLiveRunStore,
  RosterEntry,
  RunManifest,
} from './schema.js';
import { validateAcpLiveRunStore } from './validate.js';

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

export function serializeAcpLiveRunStore(store: AcpLiveRunStore): PersistedAcpLiveRunStore {
  const serialized: PersistedAcpLiveRunStore = {
    manifest: store.manifest,
    roster: [...store.roster],
    state: store.state,
  };
  const errors = validateAcpLiveRunStore(serialized);
  if (errors.length > 0) {
    throw new Error(`ACP live run store is invalid: ${errors.join('; ')}`);
  }

  return serialized;
}

export function normalizeAcpLiveRunStoreInput(value: unknown): PersistedAcpLiveRunStore {
  const errors = validateAcpLiveRunStore(value);
  if (errors.length > 0) {
    throw new Error(`input must be an ACP live run store JSON: ${errors.join('; ')}`);
  }

  return value as PersistedAcpLiveRunStore;
}

export function hydrateAcpLiveRunStore(
  input: PersistedAcpLiveRunStore,
): AcpLiveRunStore {
  return {
    manifest: input.manifest,
    roster: [...input.roster],
    state: input.state,
  };
}
