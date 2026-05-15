# Agent Kumite Core

Agent Kumite Core is the local **deterministic simulation and evaluation framework** for Agent Kumite phase 1.

This repo lets you:

- run a scripted match fixture through the harness
- write the canonical artifact bundle for that run
- generate benchmark-facing summaries and local comparison outputs
- project artifact bundles into control-room / grimoire JSON
- persist canonical ACP live run-store JSON from manifest + roster + ingress
- append new ACP ingress onto an existing persisted live run-store JSON file
- project ACP ingress into live control-room JSON through the run-store path
- serve persisted live stores over a local live-ingestion UDS daemon
- query and inspect the live-ingestion daemon through reusable client helpers and a CLI
- generate replay-lab helper outputs such as marker jumps and snapshot diffs

The current implementation is local and fixture-driven. It is the artifact / benchmark / operator-view pipeline underneath the future ACP-backed live surfaces.

If you want the fast orientation version of this repo — what is available, what you can do, and why each path exists — read [`GUIDED-TOUR.md`](./GUIDED-TOUR.md).

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
| `npm run live-store` | Read live ACP ingress into the canonical live run-store JSON shape | `live-run-store.json` |
| `npm run live-append` | Append new ACP ingress onto an existing persisted live run-store JSON file | `live-run-store.updated.json` |
| `npm run live-project` | Write live control-room JSON from either raw live inputs or a persisted live-store file | `live-control-room.json` |
| `npm run live-socket` | Serve one or more persisted live-store files over the local live-ingestion socket protocol | `live.sock` |
| `npm run live-inspect` | Inspect or drive the live-ingestion daemon with one-shot requests or a bounded subscription stream | stdout JSON / NDJSON |
| `npm run replay` | Derive replay-lab marker-jump and snapshot-diff helpers from projected control-room JSON | `replay-lab.json` |

The underlying CLI contracts are:

```bash
agent-kumite-harness --input <match.json> --output <artifacts.json> [--pretty]
agent-kumite-report --input <artifacts.json> --output <report.txt>
agent-kumite-bundle --input <match.json> --output-dir <dir> [--pretty]
agent-kumite-batch --plan <benchmark-batch-plan.json> --output-dir <dir> [--pretty]
agent-kumite-matrix --input <artifact-or-summary.json> [--input ...] --output <matrix-summary.json> --report-output <matrix-report.txt> [--pretty]
agent-kumite-project --input <artifact-bundle.json> --output <control-room.json> [--pretty]
agent-kumite-live-store --manifest <run-manifest.json> --roster <roster.json> --ingress <acp-ingress.json> --output <live-run-store.json> [--pretty]
agent-kumite-live-append --store-input <live-run-store.json> --ingress <acp-ingress.json> --output <live-run-store.json> [--pretty]
agent-kumite-live-project (--store-input <live-run-store.json> | --manifest <run-manifest.json> --roster <roster.json> --ingress <acp-ingress.json>) --output <live-control-room.json> [--pretty]
agent-kumite-live-socket --socket <live-ingestion.sock> --store-input <live-run-store.json> [--store-input <live-run-store.json> ...] [--subscriber-queue-capacity <count>]
agent-kumite-live-inspect <get-store|get-projection|append-ingress|subscribe> --socket <live-ingestion.sock> --run-id <run-id> [--request-id <id>] [--pretty] [--ingress <acp-ingress.json>] [--event <store_updated|server_stopping>] [--initial-snapshot <none|store|projection>] [--limit <count>]
agent-kumite-replay --input <control-room.json> --output <replay-lab.json> [--marker <marker-id>] [--from <round:phase>] [--to <round:phase>] [--pretty]
```

## Canonical demo fixtures

| Fixture | What it is |
| --- | --- |
| `fixtures/demo-match.input.json` | The main deterministic demo match input used for local runs |
| `fixtures/demo-batch.plan.json` | A small runnable batch plan over the demo match input |
| `fixtures/artifact-bundle.minimal.c5.json` | A canonical bundled artifact fixture for validation and downstream tests |
| `fixtures/run-manifest.live.c5.json` | A standalone live-run manifest that matches the ACP ingress demo sequence |
| `fixtures/roster.demo.json` | A standalone six-agent roster fixture for live adapter commands |
| `fixtures/acp-ingress.sequence.c5.json` | A canonical ACP ingress sequence for live-path validation |
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

### 4. Project ACP ingress into live control-room JSON

```bash
npm run live-store -- \
  --manifest fixtures/run-manifest.live.c5.json \
  --roster fixtures/roster.demo.json \
  --ingress fixtures/acp-ingress.sequence.c5.json \
  --output out/live/run-store.live.json \
  --pretty
```

Use this when you want the canonical persisted live store itself:

- run manifest + roster + reduced live state in one JSON shape
- replay bundle and intervention history preserved for later consumers
- a stable file boundary before downstream projections

### 5. Project ACP ingress into live control-room JSON

```bash
npm run live-project -- \
  --manifest fixtures/run-manifest.live.c5.json \
  --roster fixtures/roster.demo.json \
  --ingress fixtures/acp-ingress.sequence.c5.json \
  --output out/live/control-room.live.json \
  --pretty
```

Use this when you want the live-path adapter surface:

- canonical ACP ingress reduced through the live run store
- live home / callsheet / layered snapshot / replay JSON
- no fabricated benchmark summary or aftermath fields

If you already have a persisted live store, you can project from that directly:

```bash
npm run live-project -- \
  --store-input out/live/run-store.live.json \
  --output out/live/control-room.from-store.json \
  --pretty
```

If you already have a persisted live store and want to append more ingress instead of rebuilding it:

```bash
npm run live-append -- \
  --store-input out/live/run-store.live.json \
  --ingress fixtures/acp-ingress.sequence.c5.json \
  --output out/live/run-store.updated.json \
  --pretty
```

If you want to serve a persisted live store over the local UDS transport:

```bash
npm run live-socket -- \
  --socket out/live/live.sock \
  --store-input out/live/run-store.live.json
```

Use this when you want the first real incremental transport boundary:

- a local newline-delimited JSON socket for one-shot requests and subscriptions
- canonical state loaded from persisted live-store JSON files instead of ad hoc in-memory fixtures
- graceful shutdown on `SIGINT` / `SIGTERM`

If you want to inspect or drive that daemon from the command line:

```bash
npm run live-inspect -- \
  get-projection \
  --socket out/live/live.sock \
  --run-id run_demo_c5_seed_0001 \
  --pretty
```

Or open a short bounded subscription stream:

```bash
npm run live-inspect -- \
  subscribe \
  --socket out/live/live.sock \
  --run-id run_demo_c5_seed_0001 \
  --initial-snapshot projection \
  --limit 3
```

Use this when you want:

- a reusable client boundary instead of ad hoc `net.Socket` code
- one-shot store/projection reads or ingress appends against the daemon
- a quick smoke/inspection path for subscription bootstrap and updates

### 6. Run a small benchmark batch locally

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

### 7. Run matrix comparison directly

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
