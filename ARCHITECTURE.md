# Agent Kumite Architecture Boundary

This document explains the **phase-1 architecture boundary** for Agent Kumite:

- what the repo implements today
- what ACP is expected to own in future live runs
- how multiple ACP sessions map to one Kumite match
- what must stay invariant between fixture-driven and ACP-backed execution
- what is in scope for phase 1 versus later orchestration work

This is an implementation-guiding architecture note. It does not replace the locked specs.

## One-sentence framing

> **Phase 1 ships a deterministic artifact pipeline now, and targets ACP-backed orchestration later, without changing the canonical run artifacts or operator lifecycle.**

## Current repo boundary

Today this repo is a **local deterministic simulation and evaluation framework**.

It already provides:

- deterministic match execution from a fixture input
- canonical artifact-bundle output
- benchmark summary, batch, and matrix reporting
- control-room projection JSON
- replay-lab helper JSON

It does **not** yet provide:

- live ACP session orchestration
- provider-facing agent runtime integration
- multi-session live match composition
- production operator surfaces talking to a real control plane

That boundary is intentional. The current repo is the artifact and evaluation layer underneath those future live surfaces.

## Architectural layers

Phase 1 should be read as four layers:

1. **Canonical match model**
2. **Execution layer**
3. **Control plane**
4. **Operator / replay surfaces**

### 1. Canonical match model

The canonical match model is the stable center.

It includes:

- run manifest and condition tagging
- replay bundle and timeline ordering
- roster, public events, structured commitments, private messages
- task outputs and ratings
- interventions / `awaiting` outcomes
- final scores and benchmark summaries

These records are the thing that must survive both local simulation and future live runs.

### 2. Execution layer

The execution layer is how a match is actually advanced.

There are two execution modes:

- **fixture-driven local execution** — what the repo does today
- **ACP-backed live execution** — the planned future mode

The execution mode may change. The canonical artifact contract must not.

### 3. Control plane

ACP is the intended control plane for live execution.

The control plane owns:

- starting and tracking agent-side runs / sessions
- carrying normalized message and trajectory metadata
- expressing pause / resume via `awaiting`
- keeping provider credentials and provider-specific APIs out of the operator surfaces

The repo does not need to speak provider SDKs directly to satisfy phase 1. It needs a control surface that can be normalized into the Kumite artifact model.

### 4. Operator / replay surfaces

Swift, Discord, replay views, and benchmark reporting are downstream surfaces.

Their job is to:

- consume canonical run state
- render operator-facing projections
- resolve canonical `awaiting` records
- replay and compare runs from persisted artifacts

They must not become the only home of state that the artifact layer cannot reproduce.

## Current mode: fixture-driven local pipeline

The current repo already supports a complete local pipeline:

1. `simulate` / `bundle` execute a deterministic match fixture
2. `report` renders aftermath text
3. `batch` and `matrix` produce benchmark-facing comparisons
4. `project` derives control-room style JSON
5. `replay` derives replay navigation and diff helpers

In this mode:

- the input is a fully materialized match fixture
- the harness owns the entire round/phase loop locally
- no ACP sessions are required
- no provider connectivity is required
- no live operator surface is required

This mode exists to make the benchmark and artifact contract real before the live orchestration layer exists.

## Target mode: ACP-backed live orchestration

The future live mode should introduce ACP **around** the canonical artifact model, not instead of it.

At a high level:

1. a Kumite orchestrator starts and coordinates a match
2. individual agent turns are executed through ACP runs / sessions
3. ACP-aligned envelopes are normalized into canonical Kumite records
4. the run store persists those records
5. benchmark, control-room, replay, and audit outputs derive from the same persisted state

### Planned live architecture

Conceptually:

```text
ACP-backed agents / services
        |
        v
Kumite orchestration layer
        |
        v
canonical run store / artifact writer
        |
        +--> benchmark + matrix outputs
        +--> control-room projection
        +--> replay bundle + helpers
        +--> operator surfaces (Swift / Discord)
```

The orchestration layer is where live ACP composition belongs. The artifact writer and downstream projections should stay recognizable to the current repo.

## Multi-session match mapping

One Kumite match is expected to span **multiple ACP sessions or runs**.

At minimum, future live execution should assume:

- one session or run per agent turn stream
- one referee / orchestrator context
- optional additional session-level control objects for approvals, intervention routing, or tool mediation

That means a Kumite match is **not** a one-session object by default.

### Required mapping discipline

The composition layer should maintain stable identities for:

- `match_id`
- `run_id`
- `agent_id`
- ACP session / run ids
- round
- phase
- `await_id`

The mapping rule is:

> **ACP session identity is transport-level state; Kumite run identity is benchmark-level state.**

Transport identifiers can vary by provider or ACP server implementation. Kumite identifiers must stay stable enough to reproduce replay, benchmark joins, and operator audit.

### What the mapper needs to do

The orchestration layer should:

1. group multiple ACP session streams under one Kumite `run_id`
2. normalize provider-specific or ACP-server-specific metadata into stable Kumite records
3. preserve enough provenance to debug live runs without leaking provider-specific assumptions into the rest of the system
4. attach each live event to a round/phase edge so replay and benchmark logic remain deterministic at the artifact layer

## The real-run boundary

The most important architecture rule is the seam between **deterministic local fixtures** and **future live ACP-backed runs**.

### What stays the same across both modes

These should remain invariant:

- condition naming (`C1`-`C5`, optional `C4*`)
- run manifest semantics
- round / phase boundaries
- intervention taxonomy and `awaiting` lifecycle
- artifact bundle meaning
- benchmark summary meaning
- replay marker and snapshot semantics
- operator-surface projections as derived views

If a live ACP run cannot be reduced into those canonical records, it is not phase-1-complete yet.

### What changes between modes

These are allowed to differ:

| Topic | Fixture-driven local mode | ACP-backed live mode |
| --- | --- | --- |
| Input source | Fully materialized match fixture JSON | Live ACP sessions and orchestration decisions |
| Agent execution | Local deterministic runner | ACP-mediated remote or service-backed agent execution |
| Pause/resume | Encoded in fixture/runtime defaults | Real `awaiting` objects resolved by operator surfaces |
| Trajectory transport | Local artifact generation | ACP message / metadata transport normalized into artifacts |
| Failure modes | Fixture/schema/runtime errors | Session drift, transport errors, timeout, provider variance |

### What must not move across the seam

These concerns should not leak out of the live orchestration layer:

- provider SDK selection
- provider API tokens
- per-user OAuth flows
- provider-specific session identifiers as primary run ids
- provider-specific event taxonomies as canonical benchmark artifacts

The rest of the system should see ACP-aligned Kumite records, not provider-native traffic.

## `awaiting` as the live control hook

`awaiting` is the architectural bridge between the local artifact model and future live intervention.

Why it matters:

- it gives live runs a canonical pause / resume object
- it keeps Swift and Discord on the same lifecycle
- it lets C4 and C5 differ by affordance set without requiring separate runtime models
- it preserves intervention events as benchmark-grade artifacts rather than UI-only side effects

For phase 1, live intervention kinds remain:

- `question`
- `nudge`
- `approval`

`role_change`, `freeze`, and `ejection` stay future-condition primitives, not live phase-1 baseline behavior.

## Scope for phase 1

Phase 1 **does** need:

- the canonical artifact contract
- deterministic local execution
- benchmark-grade output and replay support
- an ACP-aligned architecture boundary
- a thin Kumite-specific orchestration layer on top of ACP if ACP alone does not express all required match composition behavior

Phase 1 **does not** need:

- direct provider integration in operator-facing code
- per-user provider auth flows
- a general-purpose agent platform
- a fully generalized orchestration framework for every multi-agent product
- speculative live features that cannot be reconciled with the canonical artifact model

## Implementation guidance

If someone starts building the live layer after phase 1, the safe order is:

1. keep the local artifact pipeline authoritative
2. introduce an ACP-facing orchestration layer that writes the same canonical records
3. prove that one live run can be replayed and benchmarked with the same downstream tools
4. only then let the operator surfaces depend on live ACP-backed state

That order matters because it keeps the benchmark and replay contracts ahead of the surface ergonomics.

## Anti-patterns

These are the architectural mistakes this document is trying to prevent:

1. **Provider leakage into the product boundary** — building Swift, Discord, or benchmark logic directly on provider APIs.
2. **Surface-only state** — letting live operator views invent facts that do not exist in the artifact layer.
3. **Single-session assumptions** — pretending one ACP session is the whole match.
4. **Speculative orchestration-first buildout** — building a live system before the artifact, replay, and benchmark contracts are stable.
5. **Condition drift** — letting live intervention behavior redefine `C4` / `C5` semantics instead of consuming the locked specs.

## Practical reading of the repo today

If you are contributing right now, interpret the repo like this:

- `src/` implements the deterministic artifact pipeline
- `fixtures/` provide local benchmark-grade inputs
- `README.md` explains how to run the local framework
- `WORKFLOW.md` explains how issue work moves through the repo and vault
- `BENCHMARKS.md` explains how benchmark outputs are operated and retained
- this file explains how those local pieces are intended to connect to future ACP-backed live execution

## Bottom line

The architectural target is not “replace the harness with ACP.”

It is:

> **Keep the harness artifact model canonical, add ACP as the live control plane, and make future real runs look like richer producers of the same benchmark, replay, and operator-facing records the repo already understands.**
