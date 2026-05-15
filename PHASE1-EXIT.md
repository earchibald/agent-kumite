# Agent Kumite Phase 1 Exit Checklist

This document turns the locked phase-1 thesis and benchmark protocol into a **final readiness gate**.

Use it when deciding whether phase 1 is ready to close, publish, or reopen.

It is not enough for the repo to feel “mostly done.” Phase 1 closes only when the benchmark evidence, annotation work, reproducibility checks, and architectural constraints all line up.

## Required closeout inputs

Before using this checklist, have the following in hand:

1. the retained benchmark evidence set for the final matrix runs
2. the published seed ledger and any replenishment history
3. matrix summaries and human-readable reports for the final contrasts
4. annotation outputs and adjudication records
5. operator-pattern notes or summaries for the show-layer lessons
6. reproducibility evidence from a second-operator rerun
7. architecture notes for ACP control-plane coverage and any known gaps

If one of those inputs is missing, closeout is not ready yet.

## Exit states

Use one of three outcomes only:

| Outcome | Meaning |
| --- | --- |
| **Ready to close** | All success bars are satisfied, no falsification criterion fired, and the evidence set is complete. |
| **Not ready yet** | The framing still looks viable, but required evidence or review work is incomplete. |
| **Reopen phase 1** | One or more thesis-level falsification criteria fired. |

## Gate 1: Matrix completeness

Do not evaluate the phase-level claims until the benchmark matrix itself is whole.

- [ ] `C1` through `C5` each have at least 12 valid runs.
- [ ] Every published contrast has matched-seed completeness.
- [ ] Invalid or contaminated runs were consumed and replenished through the declared seed ledger.
- [ ] The final seed ledger and replacement history are recorded.
- [ ] The retained benchmark evidence set matches `BENCHMARKS.md`.

If this gate fails, the phase is **not ready yet**.

## Gate 2: Artifact completeness

The evidence set must be replayable and auditable from artifacts alone.

- [ ] Run manifests exist for the retained runs.
- [ ] Replay bundles exist for the retained runs.
- [ ] Public events, commitments, private messages, task outputs, interventions, and final scores are present for the metric families being claimed.
- [ ] Matrix summary and matrix report exist for the final benchmark readout.
- [ ] Required annotation outputs are retained with the benchmark evidence.
- [ ] No claim depends on out-of-band notes that the canonical artifact set cannot justify.

If this gate fails, the phase is **not ready yet**. If the missing evidence is structural rather than accidental, the phase may need to be **reopened**.

## Gate 3: Annotation operations complete

Phase 1 closeout requires the human rating work to be operationally finished, not merely started.

- [ ] Every required human-rated item was scored by two independent raters.
- [ ] Condition labels, model families, and seed IDs were redacted where required.
- [ ] `reported_reasoning` was excluded from primary trust and deception packets.
- [ ] Every disagreement of 1 point was averaged per protocol.
- [ ] Every disagreement greater than 1 point was adjudicated and recorded.
- [ ] Final merged ratings are available for analysis and evidence capture.

If this gate fails, the phase is **not ready yet**.

## Gate 4: Thesis success bars

Each thesis-level success bar needs an explicit yes/no read.

### 1. Signal beyond same-model baseline

- [ ] `C3`/`C4` are materially distinguishable from `C1`/`C2` on at least one primary metric.

### 2. Divergence outperforms reasoning

- [ ] commitment/action divergence predicts betrayal better than visible-reasoning analysis on the same runs.

### 3. Observe and intervene differ

- [ ] `C5` produces materially different alliance, betrayal, or task-quality outcomes than `C4`.

### 4. Show layer earns its keep

- [ ] at least three operator-pattern lessons tied to cast identity, pressure shell, replay markers, or similar show-layer elements are documented and reusable outside the arena.

### 5. Harness is reproducible

- [ ] a second operator can rerun a condition from artifacts and reproduce the metric distribution within the agreed tolerance.

### 6. ACP covers the control surface

- [ ] the required operator actions remain ACP-expressible directly or through a thin Kumite-specific orchestration layer.
- [ ] no production-path requirement depends on direct provider tokens or per-user OAuth.

All six must pass for phase 1 to be **ready to close**.

## Gate 5: Falsification check

Run the failure list explicitly. Do not skip this because the success bars looked good.

- [ ] mixed-model matches are materially more informative than same-model matches
- [ ] betrayal timing looks strategic rather than random or tactic-collapsed
- [ ] task outputs add signal beyond chat alone
- [ ] humans beat chance on the prediction task from available telemetry
- [ ] no dominant single tactic collapses the strategy space
- [ ] show surfaces remain downstream of canonical state rather than requiring out-of-band annotation
- [ ] ACP can carry the control plane without provider-credential leakage

If any line above fails, the correct closeout result is **reopen phase 1**.

## Gate 6: Review points

Use these review points in order:

1. **Data review** — confirm matrix completeness, retained evidence, and artifact integrity.
2. **Annotation review** — confirm rating packets, raw scores, adjudications, and merged outputs are complete.
3. **Readout review** — walk success bars and falsification criteria against the final matrix outputs.
4. **Architecture review** — confirm the ACP/control-plane boundary still holds and no operator surface violated it.
5. **Decision review** — mark the phase as ready to close, not ready yet, or reopened.

Do not skip from raw benchmark outputs straight to a final thesis call.

## Required closeout outputs

When phase 1 reaches a decision, capture:

1. the final closeout decision (`ready`, `not ready`, or `reopen`)
2. the benchmark evidence set location
3. the final matrix readout and contrast summaries
4. the annotation / adjudication completion record
5. the reproducibility check result
6. the operator-pattern lessons that clear the show-layer success bar
7. any ACP/control-plane gaps that remain open

## Minimal final checklist

Use this condensed version at the end:

- [ ] Matrix complete and matched
- [ ] Evidence retained and replayable
- [ ] Annotation complete and adjudicated
- [ ] Success bars all pass
- [ ] No falsification criterion fires
- [ ] Reproducibility confirmed
- [ ] ACP/control-plane boundary still holds
- [ ] Final decision and evidence captured

## Bottom line

> **Phase 1 closes only when the benchmark is whole, the annotation work is complete, the thesis bars pass, and the evidence package is strong enough for a second operator to audit and rerun it.**
