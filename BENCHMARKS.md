# Agent Kumite Benchmark Runbook

This document describes the **phase-1 benchmark operating loop** for Agent Kumite:

- how seeds are declared
- how a batch is executed
- how matrix outputs are produced
- how invalid runs are handled
- which files count as retained benchmark evidence
- what can be cleaned up after a local run

This is an operational runbook, not a product spec. It explains how to run and preserve the benchmark outputs the current repo already knows how to produce.

## Benchmark mental model

The benchmark flow is built around **matched seeds across named conditions**.

In practice:

1. publish a batch plan with an explicit seed ledger
2. run the batch plan through the batch CLI
3. let the batch runner stop when it has enough fully matched valid seeds
4. use the emitted matrix outputs as the top-level comparison artifact
5. retain the batch ledger and selected per-run outputs as the benchmark evidence set

## Required inputs

A benchmark batch plan contains:

- `batchId`
- `seedLedger`
- `targetMatchedSeedCount`
- `conditions`
- optional `runOverrides`

The current schema requires all seeds to be published explicitly up front in the plan file.

## Seed-ledger publication policy

The **seed ledger is part of the benchmark contract**.

That means:

- seeds should be declared in the batch plan before the run starts
- the plan file should be saved and retained as part of the benchmark evidence
- the issue note should reference the plan path or committed plan fixture when the run matters historically

Do not treat seeds as an informal note in chat or as an after-the-fact reconstruction from output files.

### Recommended practice

- keep reusable benchmark plans in `fixtures/` when they are meant to be rerun
- give each benchmark slice a stable `batchId`
- expand the seed ledger by editing the plan, not by manually stitching multiple unrelated runs together

## Running a benchmark batch

The default execution path is:

```bash
npm run batch -- --plan fixtures/demo-batch.plan.json --output-dir out/batch --pretty
```

The batch CLI:

1. reads and validates the plan
2. materializes one run per `(seed, condition)`
3. writes a `match-input.json` into each per-run directory
4. bundles each run into the standard local output set
5. stops early once `targetMatchedSeedCount` fully matched valid seeds have been reached
6. writes matrix-ready aggregate outputs at the batch root

## Output layout

Given `--output-dir out/batch`, the run writes:

- `out/batch/batch-plan.json`
- `out/batch/batch-ledger.json`
- `out/batch/matrix-inputs.json`
- `out/batch/matrix-summary.json`
- `out/batch/matrix-report.txt`
- `out/batch/runs/seed-XXXX/<condition>/match-input.json`
- `out/batch/runs/seed-XXXX/<condition>/artifact-bundle.json`
- `out/batch/runs/seed-XXXX/<condition>/benchmark-summary.json`
- `out/batch/runs/seed-XXXX/<condition>/aftermath.txt`

The top-level outputs are the batch-level record. The `runs/` tree is the per-run audit trail.

## What the batch ledger means

`batch-ledger.json` is the authoritative bookkeeping file for the run.

It records:

- declared conditions
- declared seed ledger
- `targetMatchedSeedCount`
- `fullyMatchedSeeds`
- `selectedSeeds`
- whether the target was reached
- total executed run count
- the benchmark-summary paths selected for matrix
- every executed run, including validity status and output paths

The `runs[*].selectedForMatrix` flag tells you which valid runs were promoted into the matrix summary for the retained comparison slice.

## Matrix generation

Batch execution already produces matrix outputs automatically. You do not need a second pass just to get the standard comparison layer.

The retained batch root includes:

- `matrix-inputs.json` — the selected seed set plus the benchmark-summary inputs used for comparison
- `matrix-summary.json` — structured comparison output
- `matrix-report.txt` — human-readable condition summary and deltas

For ad hoc comparison outside the batch runner, you can run matrix directly:

```bash
npm run matrix -- \
  --input out/demo/benchmark-summary.json \
  --input fixtures/artifact-bundle.minimal.c5.json \
  --output out/matrix/matrix-summary.json \
  --report-output out/matrix/matrix-report.txt \
  --pretty
```

This example assumes you have already created `out/demo/benchmark-summary.json` via the README bundle flow, or that you substitute another real benchmark-summary path.

Use direct matrix runs for exploratory comparisons. Use batch output as the primary operational benchmark path.

## Invalid runs and replenishment

The repo already models invalid runs explicitly.

An invalid run is represented by a `runOverride` with fields such as:

- `condition`
- `runSeed`
- optional `inputPath`
- optional `validityStatus`
- optional `invalidationReason`
- optional `codeRevision`

Example shape:

```json
{
  "condition": "C5",
  "runSeed": 2,
  "validityStatus": "invalid",
  "invalidationReason": "operator contamination"
}
```

### How replenishment works

The batch runner does **not** count invalid runs toward the matched-seed target.

Instead, it keeps executing forward through the published seed ledger until it has enough **fully matched valid seeds** across the declared conditions, or until the seed ledger is exhausted.

That means replenishment is automatic **inside the published ledger**:

- invalid runs are preserved in the ledger
- later seeds can replace them for matrix selection
- selected matrix inputs come only from valid runs on the chosen fully matched seeds

### Rerun handling policy

If the batch exhausts the published seed ledger before reaching `targetMatchedSeedCount`:

1. update the plan with more published seeds
2. rerun the batch from the updated plan
3. treat the new batch output as the authoritative run record

Do not manually splice matrix inputs from separate batch roots to fake a complete matched set.

If a run needs a different input or revision, record that through `runOverrides` so the ledger explains why that run differs.

## Retained benchmark evidence

For a benchmark run that matters beyond local exploration, retain:

1. `batch-plan.json`
2. `batch-ledger.json`
3. `matrix-inputs.json`
4. `matrix-summary.json`
5. `matrix-report.txt`
6. per-run `match-input.json`, `artifact-bundle.json`, `benchmark-summary.json`, and `aftermath.txt` for every run where `selectedForMatrix` is `true`

Also retain invalid-run records when they explain why a seed was skipped or replenished. In practice, the ledger usually captures enough, but keeping the corresponding per-run directory is appropriate when the invalidation reason matters for auditability.

### What is not benchmark evidence by default

These are useful working artifacts, but they are not part of the default retained benchmark packet unless a specific issue says otherwise:

- ad hoc `out/demo/` runs
- replay-lab helper files
- control-room projections
- exploratory matrix runs that are not tied to the benchmark issue being closed

## Retention and cleanup boundaries

Generated outputs under `out/` are **working outputs**, not source files.

Default policy:

- do not commit generated benchmark outputs to the repo unless an issue explicitly calls for checked-in fixtures
- keep the authoritative benchmark evidence together in one batch root while the issue is active
- once the evidence has been reviewed, summarized, and copied to its intended archival location, local `out/` directories may be deleted

### Safe to clean up

These are normally disposable after review:

- exploratory `out/demo/` directories
- scratch `out/matrix/` comparisons
- superseded batch roots from failed exploratory runs

### Do not clean up prematurely

Do not delete the active batch root before:

- the issue note records what was run
- the retained evidence set has been identified
- the matrix report and ledger have been reviewed

## Recommended closeout checklist

Before calling a benchmark slice done, confirm:

- [ ] the plan file declares the real seed ledger
- [ ] the batch completed or explicitly exhausted the ledger
- [ ] invalid runs are explained in the ledger or overrides
- [ ] the retained evidence set is clear
- [ ] the issue note references the benchmark plan and outputs that mattered
- [ ] disposable outputs are not being mistaken for benchmark evidence

## Practical benchmark loop

For a normal benchmark issue:

```bash
# 1. run the benchmark plan
npm run batch -- --plan fixtures/demo-batch.plan.json --output-dir out/batch --pretty

# 2. inspect the top-level batch record
cat out/batch/matrix-report.txt

# 3. inspect the ledger for selected and invalid runs
cat out/batch/batch-ledger.json
```

If you need a one-sentence rule to remember:

> **Publish the seeds up front, keep the ledger, retain the selected matrix evidence, and treat everything else under `out/` as disposable working state unless an issue explicitly promotes it.**
