import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createAftermathReport,
  renderAftermathReport,
  runHarnessFromFile,
  validateArtifactBundle,
  writeAftermathReportFromFile,
} from '../src/index.ts';

describe('aftermath reporting', () => {
  it('creates a deterministic aftermath summary from a generated artifact bundle', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-report-'));
    const artifactPath = join(dir, 'artifacts.json');
    const result = await runHarnessFromFile({
      inputPath: join('/Users/earchibald/Code/agent-kumite/.worktrees/AK-25', 'fixtures/demo-match.input.json'),
      outputPath: artifactPath,
      pretty: true,
    });

    expect(validateArtifactBundle(result.artifactBundle)).toEqual([]);
    const summary = createAftermathReport(result.artifactBundle);
    expect(summary.runId).toBe('run_demo_c4_0001');
    expect(summary.winners[0]?.agentId).toBe('agent-alpha');
    expect(summary.eliminations[0]?.agentId).toBe('agent-saboteur');
    expect(summary.divergenceSummary.total).toBeGreaterThan(0);
    expect(summary.benchmarkSummary.totals.replayMarkers).toBeGreaterThan(0);
    expect(summary.roundScores).toHaveLength(3);

    const rendered = renderAftermathReport(summary);
    expect(rendered).toContain('Benchmark: rounds=3');
    expect(rendered).toContain('Winners: agent-alpha');
    expect(rendered).toContain('Divergences:');
    expect(rendered).toContain('Eliminations: r3:agent-saboteur');
  });

  it('writes a report file from canonical artifact JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-kumite-report-file-'));
    const artifactPath = join(dir, 'artifact-bundle.json');
    const reportPath = join(dir, 'aftermath.txt');
    const source = await readFile(
      join('/Users/earchibald/Code/agent-kumite/.worktrees/AK-25', 'fixtures/artifact-bundle.minimal.c5.json'),
      'utf8',
    );
    await writeFile(artifactPath, source);

    const report = await writeAftermathReportFromFile({
      inputPath: artifactPath,
      outputPath: reportPath,
    });

    const written = await readFile(reportPath, 'utf8');
    expect(written).toBe(report);
    expect(written).toContain('Benchmark: rounds=3');
    expect(written).toContain('Run: run_c5_seed_0001 (C5)');
    expect(written).toContain('Divergences: 2');
    expect(written).toContain('Standings:');
  });
});
