import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseBundleCliArgs,
  runHarnessBundleFromFile,
  validateArtifactBundle,
} from '../src/index.ts';

describe('bundled local harness output', () => {
  it('parses the bundled CLI contract', () => {
    const parsed = parseBundleCliArgs(['--input', 'fixtures/demo-match.input.json', '--output-dir', 'out/demo', '--pretty']);

    expect(parsed.inputPath.endsWith('fixtures/demo-match.input.json')).toBe(true);
    expect(parsed.outputDir.endsWith('out/demo')).toBe(true);
    expect(parsed.pretty).toBe(true);
  });

  it('writes artifacts and aftermath report into a predictable directory', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'agent-kumite-bundle-'));
    const result = await runHarnessBundleFromFile({
      inputPath: join('/Users/earchibald/Code/agent-kumite/.worktrees/AK-24', 'fixtures/demo-match.input.json'),
      outputDir,
      pretty: true,
    });

    const artifact = JSON.parse(await readFile(result.artifactPath, 'utf8'));
    const report = await readFile(result.reportPath, 'utf8');

    expect(validateArtifactBundle(artifact)).toEqual([]);
    expect(artifact.speechCommitmentLinks.length).toBeGreaterThan(0);
    expect(artifact.commitmentDivergences.length).toBeGreaterThan(0);
    expect(result.artifactPath).toBe(join(outputDir, 'artifact-bundle.json'));
    expect(result.reportPath).toBe(join(outputDir, 'aftermath.txt'));
    expect(report).toContain('Winners: agent-alpha');
    expect(report).toContain('Divergences:');
    expect(report).toContain('Eliminations: r3:agent-saboteur');
  });
});
