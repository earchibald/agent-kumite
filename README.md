# Agent Kumite Core

Agent Kumite Core is the local **deterministic simulation and evaluation framework** for Agent Kumite phase 1.

This repo lets you:

- run a scripted match fixture through the harness
- write the canonical artifact bundle for that run
- generate benchmark-facing summaries and local comparison outputs
- project artifact bundles into control-room / grimoire JSON
- generate replay-lab helper outputs such as marker jumps and snapshot diffs

The current implementation is local and fixture-driven. It is the artifact / benchmark / operator-view pipeline underneath the future ACP-backed live surfaces.

## Prerequisites

- Node.js
- npm

Install dependencies and build the CLIs once before using the command surface:

```bash
npm install
npm run build
```

You can run the test suite with:

```bash
npm test
```

## Quick start

The shortest path to seeing the framework work is to bundle the demo match fixture:

```bash
npm run bundle -- --input fixtures/demo-match.input.json --output-dir out/demo --pretty
```

That writes:

- `out/demo/artifact-bundle.json`
- `out/demo/benchmark-summary.json`
- `out/demo/aftermath.txt`

From there you can derive the operator-facing and replay-facing views:

```bash
npm run project -- --input out/demo/artifact-bundle.json --output out/demo/control-room.json --pretty
npm run replay -- --input out/demo/control-room.json --output out/demo/replay-lab.json --marker marker_evt_r3_simultaneous_reveal_vote_reveal_1 --from 3:public_square --to 3:simultaneous_reveal --pretty
```

That adds:

- `out/demo/control-room.json`
- `out/demo/replay-lab.json`

## Command guide

| Command | Purpose | Example output |
| --- | --- | --- |
| `npm run simulate` | Run one deterministic match input and write the raw artifact bundle JSON | `out/demo/artifacts.json` |
| `npm run report` | Read an artifact bundle and render a text aftermath report | `out/demo/aftermath.txt` |
| `npm run bundle` | Run one deterministic match and write the canonical local bundle outputs | `out/demo/artifact-bundle.json`, `benchmark-summary.json`, `aftermath.txt` |
| `npm run batch` | Execute a seed-ledger batch plan and write per-run + aggregate benchmark outputs | `out/batch/` |
| `npm run matrix` | Compare multiple artifact bundles or benchmark summaries across conditions | `matrix-summary.json`, `matrix-report.txt` |
| `npm run project` | Project one artifact bundle into layered control-room / grimoire JSON | `control-room.json` |
| `npm run replay` | Derive replay-lab marker-jump and snapshot-diff helpers from projected control-room JSON | `replay-lab.json` |

The underlying CLI contracts are:

```bash
agent-kumite-harness --input <match.json> --output <artifacts.json> [--pretty]
agent-kumite-report --input <artifacts.json> --output <report.txt>
agent-kumite-bundle --input <match.json> --output-dir <dir> [--pretty]
agent-kumite-batch --plan <benchmark-batch-plan.json> --output-dir <dir> [--pretty]
agent-kumite-matrix --input <artifact-or-summary.json> [--input ...] --output <matrix-summary.json> --report-output <matrix-report.txt> [--pretty]
agent-kumite-project --input <artifact-bundle.json> --output <control-room.json> [--pretty]
agent-kumite-replay --input <control-room.json> --output <replay-lab.json> [--marker <marker-id>] [--from <round:phase>] [--to <round:phase>] [--pretty]
```

## Canonical demo fixtures

| Fixture | What it is |
| --- | --- |
| `fixtures/demo-match.input.json` | The main deterministic demo match input used for local runs |
| `fixtures/demo-batch.plan.json` | A small runnable batch plan over the demo match input |
| `fixtures/artifact-bundle.minimal.c5.json` | A canonical bundled artifact fixture for validation and downstream tests |
| `fixtures/awaiting.approval.c5.json` | A canned `awaiting` / intervention fixture |
| `fixtures/match-state.round3-phase6.c5.json` | A snapshot-style match-state fixture |
| `fixtures/replay-bundle.round1-to-round3-phase6.c5.json` | A replay bundle fixture |
| `fixtures/run-manifest.c4.json` | A standalone run manifest fixture |

## Practical local flows

### 1. Run a single match and inspect the outputs

```bash
npm run bundle -- --input fixtures/demo-match.input.json --output-dir out/demo --pretty
cat out/demo/aftermath.txt
```

Use this when you want one canonical run record plus a quick human-readable recap.

### 2. Project one bundled run into operator-facing JSON

```bash
npm run project -- --input out/demo/artifact-bundle.json --output out/demo/control-room.json --pretty
```

Use this when you want the layered control-room / grimoire view:

- home summary
- callsheet rows
- layered public/private/alert/intervention snapshots
- replay digests
- aftermath projection

### 3. Generate replay-lab helper data

```bash
npm run replay -- --input out/demo/control-room.json --output out/demo/replay-lab.json --marker marker_evt_r3_simultaneous_reveal_vote_reveal_1 --from 3:public_square --to 3:simultaneous_reveal --pretty
```

Use this when you want:

- a resolved jump target for a replay marker
- a deterministic diff between two replay cursors

### 4. Run a small benchmark batch locally

```bash
npm run batch -- --plan fixtures/demo-batch.plan.json --output-dir out/batch --pretty
```

That writes:

- per-run outputs under `out/batch/runs/`
- `out/batch/batch-plan.json`
- `out/batch/batch-ledger.json`
- `out/batch/matrix-inputs.json`
- `out/batch/matrix-summary.json`
- `out/batch/matrix-report.txt`

The batch command already emits matrix-ready aggregate outputs. Use this when you want a local seed-ledger demo rather than a single run.

### 5. Run matrix comparison directly

If you want to compare individual bundles or summaries yourself:

```bash
npm run matrix -- \
  --input out/demo/benchmark-summary.json \
  --input fixtures/artifact-bundle.minimal.c5.json \
  --output out/matrix/matrix-summary.json \
  --report-output out/matrix/matrix-report.txt \
  --pretty
```

Use this when you want direct condition comparison outside the batch runner.

## Output mental model

The pipeline is:

1. **Match input fixture** -> deterministic harness run
2. **Artifact bundle** -> canonical persisted run record
3. **Benchmark summary / matrix outputs** -> comparison-facing evaluation layer
4. **Control-room projection** -> operator-facing layered state
5. **Replay-lab helpers** -> replay navigation and diff views over projected state

If you want the shortest mental model:

> **This repo is the deterministic arena simulator plus the artifact, benchmark, control-room, and replay pipeline around it.**
