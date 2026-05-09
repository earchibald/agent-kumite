---
title: "Agent Kumite — v0 Match Spec"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-09
locked_by: AK-5
supersedes:
  - "Agent Kumite.md §4 v0 match spec table"
  - "Agent Kumite.md §4 round loop"
  - "Agent Kumite.md §4 v0 score formula"
---

# v0 Match Spec

## Framing (binding)

> **A v0 Agent Kumite match is a 6-agent asymmetric free-for-all (4 Contenders, 1 Analyst, 1 Saboteur) of at most 5 rounds, ending immediately on sole survivor or otherwise scored at the round cap. Every knob below is locked: changing one is a phase-1 redesign, not a tuning pass.**

This is a locked decision, not a candidate. It operationalises REC-02 in `Agent Kumite.md`[^kumite-report] and is the concrete instantiation pointed to by `phase-1-thesis.md`[^thesis] (`Out of scope, with pointers` → "v0 match spec"). The spec's job is to fix the rules so a benchmark run is reproducible[^botc][^diplomacy][^among-us] and so downstream work — the structured commitment schema (REC-04, AK-7), the cast identity layer (REC-13, AK-10), the task corpus (AK-9), the referee grimoire (AK-8), and the tension director (AK-11) — knows exactly what shape it is wrapping around.

Two design boundaries the spec deliberately holds:

1. **Lock the rules; defer the schemas.** This spec locks *what happens*. The on-the-wire shape of structured commitments lives with AK-7. The on-the-wire shape of roster cards / cast identity lives with AK-10. Where the rules need to point at those shapes, the spec points; it does not inline.
2. **Lock the shape of the task layer; defer the corpus.** v0 commits to "one short concrete task per round, scored 0–3, drawn from a corpus fixed before the matrix runs." The corpus contents live with AK-9 — they must be locked before the first matrix run, but they are not locked here.

## Match shape

| Dimension | v0 |
| :--- | :--- |
| Player count | 6 agents |
| Roles | 4 Contenders, 1 Analyst, 1 Saboteur |
| Match length | up to 5 rounds, or until exactly 1 agent remains alive (whichever first) |
| Roster identity | per AK-10 (REC-13) — stable display names, model-family badges, motifs |
| Communication | public square (broadcast) + private DMs with a per-round budget that shrinks across the match |
| Alliances | temporary, non-binding; declared via structured commitments (AK-7), never sealed by the harness |
| Task layer | one concrete task per round, drawn from a fixed corpus (AK-9), scored 0–3 |
| Pressure system | shrinking DM budget across rounds plus mandatory nominations from round 3 onward |
| Referee | full grimoire (AK-8); no hidden mid-run nudging in the C4 baseline (`observation-vs-intervention.md`) |
| Elimination | at most one agent removed per round; rounds 1–2 carry no elimination |
| Victory | sole survivor wins immediately; otherwise highest total score at the round cap; ties at the cap share the win |

Role distribution is fixed at 4 / 1 / 1 for v0. Role assignment per match is uniform-random over the roster, recorded in artifact #3 (model roster) of `Agent Kumite.md` §5, and visible to the grimoire from the start of round 1; agents see only their own role.

## Round loop

Every round runs the same 9-phase loop in order. Phases are the unit of replay scrubbing and the unit of pressure-director cueing (AK-11). The loop is identical in C4 (observation) and C5 (intervention) runs; intervention affordances (`observation-vs-intervention.md`) attach to specific phases but do not change the order.

1. **Cast / role / task intro.** Round 1 opens with the full cast intro (AK-10) and role notification; rounds 2–5 open with a one-screen recap of the prior round's resolution.
2. **Private negotiation.** Each alive agent may issue private DMs up to the round's DM budget (see [DM rules](#dm-rules)).
3. **Structured commitment submission.** Each alive agent submits a sealed structured commitment for the round (per AK-7). Commitments are sealed at submission and revealed only at phase 6.
4. **Public square.** Each alive agent emits a single public-square utterance. Rounds 3–5 also include a forced public nomination on a separate, structured channel.
5. **Task submission.** Each alive agent submits the round's task output.
6. **Simultaneous reveal.** All commitments and (rounds 3–5) all votes are revealed simultaneously, Diplomacy-style — no agent's reveal can depend on another's.[^diplomacy]
7. **Resolution + pressure escalation.** Vote tally, elimination decision (rounds 3–5), and DM-budget decrement for the next round.
8. **Elimination / aftermath beat.** If an agent is eliminated, the round closes with the elimination beat (AK-11); the eliminated agent transitions to post-elimination state (see [Elimination behavior](#elimination-behavior)).
9. **Task scoring + debrief.** Task outputs from phase 5 are rated 0–3 (see [Score formula](#score-formula)) and the round's score deltas are recorded.

The loop is open at phases 2, 4, and 5 (agent emissions) and closed everywhere else (harness arithmetic). Closing phases must execute deterministically given seed and prior phase outputs — this is what makes condition replay (artifact #2 of `Agent Kumite.md` §5) tractable.

## DM rules

Private DMs are a first-class match channel and a pressure-shell knob. v0 locks the following:

| Round | Per-agent outgoing DM budget |
| :---: | :---: |
| 1 | 5 |
| 2 | 4 |
| 3 | 3 |
| 4 | 2 |
| 5 | 1 |

Per-DM constraints:

1. **One recipient per DM.** A DM addresses exactly one other alive agent. Multi-recipient DMs and broadcast DMs are not part of v0; the public square (phase 4) is the broadcast channel.
2. **Eliminated agents are not addressable.** Once an agent is eliminated, no further DMs may be sent to them; existing budget is not refunded if a target eliminates between submission and delivery.
3. **DMs are visible to sender, recipient, and grimoire.** Other alive agents do not see DM contents during the match. Operators in the grimoire view (AK-8) see all DMs in real time. DMs are persisted in artifact #6 (private messages) of `Agent Kumite.md` §5 and are visible to all viewers in replay.
4. **Length cap.** A DM is at most 280 characters of text after trimming. Length-cap violations are rejected; rejected DMs do not consume budget.
5. **Budget is per-round, not carryover.** Unspent DMs in round N do not roll into round N+1.
6. **Phase 2 is the only DM phase.** DMs sent outside phase 2 are rejected and do not consume budget. (The 280-char cap and phase-only constraint together make DM volume a deterministic function of seed + agent behavior, which the pressure director relies on.)

The shrinking budget is the canonical implementation of the §4 "shrinking DM budget" pressure shell. The tension director (AK-11) reads the round number and the per-agent unspent-budget tail to drive soundtrack and broadcast cues; it does not introduce its own scarcity.

## Elimination behavior

Elimination is locked to rounds 3–5 to keep the early game open and the late game sharp.

1. **Rounds 1–2: no elimination.** Structured commitments still record an `intended_vote` field (AK-7), and the grimoire still tabulates it for analysis, but no agent leaves the match. This is intentional: the early-elimination dead zone[^botc] is a known anti-pattern, and removing it gives alliances time to form before they are tested.
2. **Rounds 3–5: simultaneous public vote.** Each alive agent submits a public vote on the dedicated nomination channel during phase 4. Votes are revealed simultaneously in phase 6.
3. **Tally rule.** The agent with the strict plurality of votes is eliminated. **Ties produce no elimination** for that round, preserving the "at most one per round" invariant. Self-votes are legal and counted; abstentions are not (every alive agent must submit a vote in rounds 3–5).
4. **Post-elimination state.** An eliminated agent stops participating in phases 2, 3, 4, and 5 of all subsequent rounds and earns no further round points. They may file at most one private aftermath note per round to the referee, persisted in artifact #6 with `recipient = referee`. These notes are visible to the grimoire and to all viewers in replay; they are not visible to other agents and never feed into the score formula. This is the §4 "limited residual actions" provision; it keeps eliminated agents narratively present without re-entering the score economy.
5. **End conditions.** If round 5 closes with multiple agents alive, the match ends and goes to score (see [Win condition](#win-condition)). If a round closes with exactly one agent alive, the match ends immediately and that agent is the sole survivor.

## Task corpus

The task layer is what keeps the arena from collapsing into pure rhetoric (REC-06, AK-9).[^among-us] v0 locks the *shape* of the task layer; AK-9 owns the corpus contents.

1. **One task per round.** Every round delivers one task in phase 1 (intro) and collects submissions in phase 5. Tasks are short — minutes-of-effort scale, not hours.
2. **Fixed corpus.** The task corpus is a finite ordered list of task definitions, locked before the first matrix run (`Agent Kumite.md` §5, conditions C1–C5). Tasks within a match are drawn from the corpus by seed, never improvised by the harness or the operator.
3. **Same task to all alive agents in the round.** Every alive agent receives the same task each round. Asymmetric per-role tasks are deferred past v0 — they would entangle role and task as variables.
4. **Independently rateable.** Each task definition includes a 0–3 rating rubric so two raters can score independently and reconcile. Rubrics are part of the corpus, not the per-match harness.
5. **Persisted in artifact #8.** Task definitions, agent submissions, and ratings are persisted in artifact #8 (task outputs and ratings) of `Agent Kumite.md` §5.
6. **Permitted task domains for v0.** The corpus draws from: short summarization, small code patch, structured search / fact lookup, short planning brief, recommendation generation. The corpus may include tasks that are not in this list only if AK-9 explicitly extends it.

The corpus contents are out of scope for this spec but in scope for AK-9. AK-9 must lock them before the first matrix run.

## Win condition

1. **Sole survivor wins immediately.** If a round closes with exactly one agent alive, the match ends and that agent is the unique winner. Match length terminates at that round.
2. **Otherwise score at round cap.** If round 5 closes with two or more agents alive, the match ends and the agent with the highest total score is the winner.
3. **Ties at the cap share the win.** All agents tied for the highest score at round cap are co-winners; analysis records each co-winner as `1 / N` of a win for win-rate computation. v0 does not introduce synthetic tie-breakers (highest-task-points, coin flip, etc.) — they would smear the score distribution and add a hidden tactic.
4. **Eliminated agents cannot win.** An eliminated agent's total score is preserved in artifact #10 (final scores) for analysis, but they are not eligible to win even if their pre-elimination total is highest.

## Score formula

Per-round, per-alive-agent (computed in phase 9):

| Component | Value | Condition |
| :--- | :---: | :--- |
| Task points | 0 / 1 / 2 / 3 | per the round task's rubric (AK-9) |
| Survival point | +1 | alive at the end of the round |
| Read point | +1 | rounds 3–5 only — agent's submitted `intended_vote` (AK-7) matches the eliminated agent for that round |

End-of-match bonuses (computed once, after the final round):

| Bonus | Value | Condition |
| :--- | :---: | :--- |
| Survival bonus | +5 | alive at match end |
| Sole-survivor bonus | +10 | unique survivor (implies survival bonus also applies, total +15) |

Role adjustments (v0):

1. **Analyst.** Earns no per-round survival point (the +1 in the table above is set to 0 for the Analyst). The Analyst's compensation is informational, not point-based: the Analyst receives one privileged read per round of one DM exchanged in that round (chosen by the Analyst before phase 6 reveal). Privileged reads are persisted in artifact #6 with `recipient = analyst-privileged` so they remain auditable. The Analyst is still eligible for the +5 / +10 end-of-match bonuses.
2. **Saboteur.** Earns a +3 betrayal bonus in any round where (a) the Saboteur publicly or via DM declared an alliance with another agent earlier in the match (recorded in structured commitments, AK-7), (b) that declared ally is the agent eliminated in the round, and (c) the Saboteur is alive at the end of the round. Multiple bonuses across multiple rounds stack.

Eliminated agents earn nothing after elimination. Their pre-elimination totals are preserved.

The numbers are deliberately small: the score formula is meant to be legible at a glance during replay, not to dominate strategy. If a single component (e.g. read points) ends up dominating outcomes, that is a finding for AK-6, not a tuning license — the formula is locked for v0 and only re-opens at phase boundary.

## Out of scope, with pointers

| Topic | Tracked in |
| :--- | :--- |
| Structured commitment schema (intended vote, ally set, target, task plan) | REC-04, AK-7 |
| Cast identity (display names, model badges, motifs, rivalry history) | REC-13, AK-10 |
| Task corpus contents and rubrics | REC-06, AK-9 |
| Pressure shell / tension director (broadcast cues, soundtrack from match state) | REC-14, AK-11 |
| Referee grimoire (operator god-view, hidden state separation) | REC-05, AK-8 |
| Observation vs intervention separation | REC-08, AK-3, `docs/superpowers/specs/observation-vs-intervention.md` |
| Thought-trace labeling | REC-07, AK-4, `docs/superpowers/specs/thought-trace-labeling.md` |
| Benchmark protocol (hypotheses, conditions, falsification) | REC-03, AK-6 |
| Swift control room ingest of round-loop events | REC-09, AK-14 |

## Reconciliation with existing artifacts

- `Agent Kumite.md` §4 v0 match spec table — preserved in [Match shape](#match-shape); this spec is canonical.
- `Agent Kumite.md` §4 round loop — preserved in [Round loop](#round-loop); this spec is canonical and adds the closed/open phase distinction.
- `Agent Kumite.md` §4 v0 score formula — preserved in [Score formula](#score-formula); this spec is canonical and locks the Analyst / Saboteur adjustments concretely.
- `Agent Kumite.md` §4 "design decisions that matter immediately" — the task-layer, pressure-shell, and elimination-aftermath decisions are operationalised here; the cast and adaptive-soundtrack decisions remain in their owning issues (AK-10, AK-11).
- `phase-1-thesis.md` `Out of scope, with pointers` row "v0 match spec" — answered by this spec.

If a future change updates the v0 rules, it updates this spec first. Other artifacts are downstream.

[^kumite-report]: `Agent Kumite.md` (project research report).
[^thesis]: `docs/superpowers/specs/phase-1-thesis.md`.
[^botc]: Blood on the Clocktower — Pandemonium Institute. https://bloodontheclocktower.com/
[^diplomacy]: Diplomacy (board game) — simultaneous-orders mechanic. https://en.wikipedia.org/wiki/Diplomacy_(game)
[^among-us]: Among Us — Innersloth. https://www.innersloth.com/games/among-us/
