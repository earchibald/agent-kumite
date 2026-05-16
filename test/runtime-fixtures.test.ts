import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  validateArtifactBundle,
  validateArtifactBundleConsistency,
  validateAwaitRecord,
  validateMatchState,
  validateReplayBundle,
  validateRunManifest,
} from '../src/index.ts';
import type { ArtifactBundle } from '../src/schema.js';

function readFixture<T>(name: string): T {
  const file = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('runtime fixture validation', () => {
  it('validates the C4 run manifest fixture', () => {
    const manifest = readFixture('run-manifest.c4.json');
    expect(validateRunManifest(manifest)).toEqual([]);
  });

  it('validates the C5 awaiting approval fixture', () => {
    const awaitRecord = readFixture('awaiting.approval.c5.json');
    expect(validateAwaitRecord(awaitRecord)).toEqual([]);
  });

  it('validates the paused C5 match-state fixture', () => {
    const matchState = readFixture('match-state.round3-phase6.c5.json');
    expect(validateMatchState(matchState)).toEqual([]);
  });

  it('validates the replay bundle fixture and its round-loop ordering', () => {
    const replayBundle = readFixture('replay-bundle.round1-to-round3-phase6.c5.json');
    expect(validateReplayBundle(replayBundle)).toEqual([]);
  });

  it('validates the minimal artifact bundle fixture and cross-artifact consistency', () => {
    const artifactBundle = readFixture<ArtifactBundle>('artifact-bundle.minimal.c5.json');
    expect(validateArtifactBundle(artifactBundle)).toEqual([]);
    expect(validateArtifactBundleConsistency(artifactBundle)).toEqual([]);
  });

  it('rejects human intervention records on observation-only conditions', () => {
    const artifactBundle = readFixture<ArtifactBundle>('artifact-bundle.minimal.c5.json');
    const mutatedBundle: ArtifactBundle = {
      ...artifactBundle,
      manifest: {
        ...artifactBundle.manifest,
        condition: 'C4',
        operatorAffordanceSet: 'observation-only',
      },
    };

    expect(validateArtifactBundleConsistency(mutatedBundle)).toContain(
      'condition C4 must not emit live intervention records',
    );
  });
});
