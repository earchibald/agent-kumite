import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCliArgs, runHarnessFromFile, validateArtifactBundle } from '../src/index.ts';

describe('local harness CLI', () => {
  it('parses the minimal CLI contract', () => {
    const parsed = parseCliArgs(['--input', 'fixtures/demo-match.input.json', '--output', 'out/demo.json', '--pretty']);

    expect(parsed.inputPath.endsWith('fixtures/demo-match.input.json')).toBe(true);
    expect(parsed.outputPath.endsWith('out/demo.json')).toBe(true);
    expect(parsed.pretty).toBe(true);
  });

  it('runs the harness from file input and writes artifact output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-cli-'));
    const outputPath = join(dir, 'artifacts.json');
    const result = await runHarnessFromFile({
      inputPath: join('/Users/earchibald/Code/agent-kumite/.worktrees/AK-20', 'fixtures/demo-match.input.json'),
      outputPath,
      pretty: true,
    });

    const written = JSON.parse(await readFile(outputPath, 'utf8'));
    expect(validateArtifactBundle(written)).toEqual([]);
    expect(written.manifest.runId).toBe('run_demo_c4_0001');
    expect(result.finalState.status).toBe('completed');
  });
});
