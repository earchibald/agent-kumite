# Agent Kumite Guided Tour

This is the short doc for getting your bearings in the repo.

If you are asking:

- **what is actually available right now?**
- **what can I do with it?**
- **why does each part matter?**

start here.

## The shortest answer

This repo is the **local deterministic simulation and evaluation framework** for Agent Kumite phase 1.

Right now, you can use it to:

1. run a scripted match fixture
2. turn that run into canonical artifacts and a human-readable report
3. compare conditions across seeds
4. project the run into operator-facing control-room style JSON
5. derive replay helpers for scrubbing and diffing
6. read the process and architecture docs for how the whole thing fits together

What you **cannot** do here yet is run a live ACP-backed match with real multi-session orchestration. That boundary is planned and documented, but not implemented in this repo today.

## What you can do right now

| If you want to... | Do this | Why it matters |
| --- | --- | --- |
| See one full match run | `npm run bundle -- --input fixtures/demo-match.input.json --output-dir out/demo --pretty` | This is the fastest way to see the arena produce a canonical run record. |
| Read a quick human recap | `cat out/demo/aftermath.txt` after `bundle` | Lets you inspect the run like a match recap instead of raw JSON. |
| Inspect the full run artifact | Open `out/demo/artifact-bundle.json` | This is the benchmark-grade persisted record of what happened. |
| See the benchmark-facing summary | Open `out/demo/benchmark-summary.json` | This is the compact comparison-ready readout for one run. |
| See the operator/control-room view | `npm run project -- --input out/demo/artifact-bundle.json --output out/demo/control-room.json --pretty` | Shows how the same run becomes layered operator-facing state. |
| Generate replay helpers | `npm run replay -- --input out/demo/control-room.json --output out/demo/replay-lab.json --marker marker_evt_r3_simultaneous_reveal_vote_reveal_1 --from 3:public_square --to 3:simultaneous_reveal --pretty` | Gives you jump targets and diffs for replay/debug-style inspection. |
| Watch the run as a broadcast | `npm run gui:demo` (or `npm run gui:demo:live`) | Launches the macOS Arena-first control-room: opens on the staged Arena scene with a focal-beat transport, with Live Ops / Replay / Callsheet / Aftermath sharing the same broadcast grammar. Read-only over the same projection JSON. |
| Run a small benchmark demo | `npm run batch -- --plan fixtures/demo-batch.plan.json --output-dir out/batch --pretty` | Shows the matched-seed batch/matrix workflow instead of a single run. |
| Compare conditions directly | `npm run matrix -- --input out/demo/benchmark-summary.json --input fixtures/artifact-bundle.minimal.c5.json --output out/matrix/matrix-summary.json --report-output out/matrix/matrix-report.txt --pretty` | Lets you look at condition deltas without running a whole batch. |

## What each command is for

### `simulate`

Use this when you want the raw harness output for one deterministic match input.

**Why:** it is the narrowest “does the runtime produce artifacts?” command.

### `report`

Use this when you already have an artifact bundle and want a text recap.

**Why:** it turns benchmark data into a fast human read.

### `bundle`

Use this when you want the main happy path.

It gives you:

- `artifact-bundle.json`
- `benchmark-summary.json`
- `aftermath.txt`

**Why:** this is the best starting point because it creates the canonical record plus both machine-facing and human-facing outputs.

### `project`

Use this when you want to see the run as operator-facing state rather than as raw benchmark artifacts.

**Why:** it is the bridge from the harness into the future control-room surfaces.

### `replay`

Use this when you want replay-friendly helpers over projected state.

**Why:** it helps answer “where should I jump?” and “what changed between these two points?”

### `batch`

Use this when you want matched-seed multi-condition benchmark output.

**Why:** phase 1 is benchmark-first, so this is the path that starts looking like real condition comparison instead of a single demo match.

### `matrix`

Use this when you want to compare existing run summaries or bundles directly.

**Why:** it is the smallest comparison tool in the repo and helps you inspect deltas without generating a fresh batch every time.

## The outputs and why they exist

| Output | What it is | Why you would care |
| --- | --- | --- |
| `artifact-bundle.json` | The canonical persisted run record | This is the source of truth for replay, comparison, and downstream projections. |
| `benchmark-summary.json` | Compact one-run evaluation summary | This is the unit you compare across conditions. |
| `aftermath.txt` | Human-readable recap | Useful when you want to understand the run quickly. |
| `control-room.json` | Operator-facing layered projection | Shows how the run would look to live-ops / grimoire tooling. |
| `replay-lab.json` | Replay helper data | Useful for marker jumps and snapshot diffs. |
| `batch-ledger.json` | Batch bookkeeping and selected-seed record | Tells you which runs counted and why. |
| `matrix-summary.json` | Structured comparison result | Good for tooling and analysis. |
| `matrix-report.txt` | Human-readable contrast report | Good for scanning condition differences quickly. |

## A good first hour in the repo

If you just want to understand the system without overthinking it:

1. Run `npm install && npm run build`
2. Run `npm run bundle -- --input fixtures/demo-match.input.json --output-dir out/demo --pretty`
3. Read `out/demo/aftermath.txt`
4. Open `out/demo/artifact-bundle.json`
5. Run `npm run project -- --input out/demo/artifact-bundle.json --output out/demo/control-room.json --pretty`
6. Run `npm run replay -- --input out/demo/control-room.json --output out/demo/replay-lab.json --marker marker_evt_r3_simultaneous_reveal_vote_reveal_1 --from 3:public_square --to 3:simultaneous_reveal --pretty`
7. Run `npm run batch -- --plan fixtures/demo-batch.plan.json --output-dir out/batch --pretty`
8. Read `out/batch/matrix-report.txt`

That sequence shows you the repo in its natural order:

**single run -> canonical artifacts -> operator projection -> replay helpers -> benchmark comparison**

## Which doc to read for which question

| If your question is... | Read this |
| --- | --- |
| How do I run the commands? | `README.md` |
| How do contributors work in this repo? | `WORKFLOW.md` |
| How do benchmark batches, retained evidence, and cleanup work? | `BENCHMARKS.md` |
| How does the future ACP/live layer relate to the current harness? | `ARCHITECTURE.md` |
| What counts as phase-1 closeout? | `PHASE1-EXIT.md` |
| How do annotation and adjudication work? | `ANNOTATION-OPS.md` |

## Why this repo matters

The repo is not just “a game simulator.”

It is the place where phase 1 makes these ideas concrete:

- betrayal and coalition behavior as measurable artifacts
- benchmark comparisons across explicit conditions
- operator-facing state derived from the same canonical run record
- replay and recap that stay grounded in persisted evidence

So when you use the repo, you are not only “running a match.” You are testing whether Agent Kumite can be:

1. **benchmarkable**
2. **inspectable**
3. **replayable**
4. **operationally legible**

## What is not here yet

These are documented, but not implemented in this repo today:

- live ACP-backed multi-session match orchestration
- production operator surfaces wired to a real control plane
- provider-facing runtime integration behind ACP
- full live intervention workflows outside the current local artifact model

That is why the repo feels very strong as a **local deterministic harness** and still intentionally incomplete as a live multi-agent product.

## Bottom line

> **What you can do here today is run, inspect, compare, project, replay, and watch (in the Arena-first macOS control-room) deterministic Agent Kumite matches — and the reason to do that is to make the arena legible as a benchmark, not just entertaining as a concept.**
