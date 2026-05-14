---
title: "Agent Kumite — Phase 1 Thesis"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-09
locked_by: AK-2
supersedes: ["Agent Kumite.md §1 (close)", "Agent Kumite.md §4 (lead-in)", "Agent Kumite.md §9 (close)", "FOLLOWUPS.md → Core product and research direction"]
---

# Phase 1 Thesis

## Framing (binding)

> **Phase 1 of Agent Kumite is benchmark-first in instrumentation and show-first in presentation, with ACP as the control plane.**

This is a locked decision, not a candidate. Every phase 1 mechanic, surface, and intervention must be reconcilable with all three parts of that sentence; if it cannot be, it is out of scope for phase 1 regardless of how compelling it is in isolation.

Derivation: REC-01 in `Agent Kumite.md` (benchmark-first / show-first), supported by Werewolf Arena (benchmark discipline), MeltingPot (population-level evaluation), Wolfcha and ArenAI (cast and watchability).[^werewolf-arena][^meltingpot][^wolfcha][^arenai] ACP-as-control-plane derives from §6 (`awaiting` as the canonical human-nudge state, REC-12, AK-12) and §7 (Swift app ingestion strategy, REC-09, AK-14), promoted here from "useful primitive" to "binding integration boundary".[^acp-openapi][^acp-await][^acp-metadata]

## What "benchmark-first in instrumentation" means

The arena is an **evaluation harness** underneath. Concretely, that means:

1. **Hypotheses come before features.** The five hypotheses in `Agent Kumite.md` §5 (mixed-model coalition richness, memory-driven alliance stability, divergence-vs-CoT for deception, observation-vs-intervention separation, threat-pressure-driven betrayal) are the gating questions for phase 1. Mechanics that cannot be tied to at least one hypothesis are deferred.
2. **Metrics are data-model-grade, not log-grade.** Structured commitments, public events, private messages, task outputs, and interventions are all first-class artifacts with stable schemas (`Agent Kumite.md` §5 artifact list, REC-04, AK-7). "Said X / did Y" divergence is computed from typed records, not regex over chat.
3. **Conditions are explicit and separated.** Observation-only and intervention-enabled runs are separate experimental conditions (REC-08, AK-3). They are never blended in baseline reporting.
4. **Reasoning is reported, not believed.** Visible thoughts are labeled as agent-reported; deception inference comes from action-vs-commitment divergence, not chain-of-thought (REC-07, AK-4).[^turpin][^sycophancy][^sleeper-agents]
5. **Falsification is published.** The phase 1 falsification list (below) is part of the harness contract, not commentary.

## What "ACP as the control plane" means

ACP (the Agent Communication Protocol) is the **binding integration boundary** between the harness and the agents being benchmarked. Concretely, that means:

1. **Agents are addressed through ACP runs and sessions, not through provider SDKs.** The harness, the Swift control room, and the Discord layer all speak ACP. Direct calls to Anthropic, OpenAI, or other provider APIs may live inside an ACP server's implementation, but they are not part of the harness's control surface and are not visible to operators.
2. **No direct API tokens, no per-user OAuth.** Operators do not hold provider credentials. The harness does not implement per-user OAuth flows for provider sign-in. Agent identity and authorization happen at the ACP layer, not the provider layer. This is a distribution constraint: the system has to be operable by people who do not personally hold provider credentials and by teams that do not want to maintain per-user OAuth integrations for every model family.
3. **`awaiting` is the canonical human-nudge state.** Human interventions route through explicit ACP pause/resume points wherever possible, not through ad-hoc message injection (REC-12, AK-12).[^acp-await]
4. **Multi-session match mapping is an explicit design problem, not an accident.** A Kumite match composes multiple ACP sessions (one per agent, plus referee/orchestrator sessions). How sessions map to a match, how match state lives if it is not native to ACP, and how trajectory metadata is normalized across providers are tracked architecture follow-ups (FOLLOWUPS "Architecture and implementation" 1, 3, 4, 8). The thesis locks the integration boundary; the follow-ups answer how to compose at it.
5. **ACP coverage is a phase 1 success bar.** If the harness needs a control surface that ACP cannot express, that is surfaced as an ACP gap to resolve (Kumite-specific orchestration on top of ACP, or upstream contributions), not bypassed by routing around ACP.

## What "show-first in presentation" means

The presentation layer is a **tournament show** on top of the harness. Concretely:

1. **The roster is a cast.** Stable display names, model-family badges, role motifs, rivalry continuity (REC-13, AK-10).[^wolfcha][^endless-werewolf][^arenai]
2. **The match has dramatic shape.** Pressure shell, elimination beats, tension-reactive soundtrack — all driven from canonical match state, never bolted on (REC-14, AK-11).[^battle-royale][^traitors][^adaptive-music]
3. **Replay is a recap, not a log dump.** Aftermath ledger, betrayal callouts, narrative beats with proof inspectable behind drill-down (Swift app §7, Discord app §8).
4. **The show surface is downstream of the data model.** The same event stream that powers metrics powers the broadcast; anything the show displays that the harness cannot persist is a bug in one or the other, not a creative liberty.

## Game-value / transfer-value contract

Game value (watchability, fun, narrative cohesion) and real-work transfer value (operator-workstation patterns, oversight surfaces, evaluation methods that generalize beyond the arena) are **not co-equal goals**. The contract is:

> **Game value is a delivery mechanism for transfer value. Show features ship in phase 1 only when they make benchmark signal more legible, operator patterns more memorable, or human-judgment behavior more elicitable.**

Operationally:

- A spectacle feature that makes a metric more interpretable (e.g. cast identity making rivalry tracking memorable, pressure shell making betrayal timing salient) — **in scope**.
- A spectacle feature that elicits operator behavior we want to study (e.g. nomination beats forcing intervention timing, replay markers driving review attention) — **in scope**.
- A spectacle feature that is purely watchable but does not improve harness signal or operator-pattern discovery (e.g. season ladders, prediction prompts, betting-like systems) — **deferred to phase 2 or beyond**, regardless of how compelling.

This contract is the lever for keeping phase 1 from drifting into novelty-without-learning. When in doubt, the question is not "is this fun?" but "what hypothesis or operator pattern does this make more visible?"

## Success criteria

Phase 1 succeeds when, by end of the v0 benchmark matrix (`Agent Kumite.md` §5, conditions C1–C5, ≥12 runs each), all five hold:

1. **Signal beyond same-model baseline.** Mixed-model conditions (C3/C4) produce coalition and betrayal patterns materially distinguishable from same-model conditions (C1/C2) on at least one primary metric (alliance duration, betrayal count, divergence rate).
2. **Divergence outperforms reasoning.** "Said X / did Y" divergence predicts subsequent betrayals more reliably than visible-reasoning sentiment classifiers on the same runs.
3. **Observe and intervene differ.** C4 (observation-only) and C5 (intervention-enabled) produce materially different alliance, betrayal, or task-quality outcomes — confirming that human interaction is a real experimental variable, not a transparent overlay.
4. **The show layer earns its keep.** At least three operator-pattern lessons traceable specifically to the show layer (cast identity, pressure shell, replay markers) are documentable and reusable outside the arena. (Examples to clear this bar: a roster-card density rule that generalizes to multi-agent triage; a pressure-driven attention-routing pattern reusable for incident response; a replay-marker schema reusable for debugging non-game agent runs.)
5. **The harness is reproducible.** A second operator can re-run any condition from artifacts alone and reproduce the metric distribution within an agreed tolerance.
6. **ACP covers the control surface.** Every operator action the harness needs (start/stop matches, observe, intervene via `awaiting`, pause/resume, replay) is expressible through ACP — directly, or through a thin Kumite-specific orchestration layer on top of ACP. No part of the production control path requires direct provider tokens or per-user OAuth.

## Failure criteria

Phase 1 is falsified — and the framing requires reopening — if any of these hold at the end of the matrix. (This list is lifted from `Agent Kumite.md` §5 and promoted to thesis-level: it gates the whole phase, not just the metrics view.)

1. **Mixed-model matches are not materially more informative than same-model matches.** Coalition and betrayal patterns are indistinguishable between C1/C2 and C3/C4.
2. **Betrayal timing is not strategic.** Betrayals look random, memory-drift driven, or dominated by a single tactic across roles and models.
3. **Task outputs add no signal beyond chat.** The work layer (REC-06, AK-9) does not change what the harness can detect about trustworthiness.
4. **Human observers cannot predict from telemetry.** Operators in C5 fail to outperform chance at predicting the next betrayal or the eliminated agent from telemetry available to them.
5. **The system is trivially gamed.** One dominant tactic (e.g. "always abstain", "always echo the loudest claim") wins a disproportionate share of matches across roles and conditions.
6. **Show-first contaminates instrumentation.** Spectacle features prove not to be expressible as views on canonical match state, requiring divergent storage or out-of-band annotation to render.
7. **ACP cannot carry the control plane.** Either ACP gaps force the harness to route around ACP for production-path operator actions, or operators cannot work without holding provider tokens / completing per-user OAuth — re-introducing exactly the distribution constraint the framing was meant to eliminate.

If (6) holds in particular, presentation is no longer downstream of the data model. If (7) holds, the integration boundary itself is wrong. Either is sufficient to require a phase-1 redesign.

## Non-goals for phase 1

- **A complete role deck.** v0 carries 4 Contenders / 1 Analyst / 1 Saboteur (`Agent Kumite.md` §4, AK-5). Novelty roles are deferred.
- **Permanent hidden factions.** Alliances are temporary and non-binding in v0.
- **A spectator product.** The show layer exists for legibility and operator-pattern elicitation. Public-facing tournaments, ladders, and prediction markets are out of scope.
- **A general-purpose agent platform.** The Swift app is a desktop-first control room targeting *this* harness; the Discord app is a secondary approval and broadcast surface for *this* harness. Generalization claims are evaluated at end of phase 1, not asserted upfront.
- **Operator-held provider credentials.** Operators do not enter Anthropic / OpenAI / other provider API tokens to run matches. The harness does not ask them to.
- **Per-user provider OAuth flows.** The harness does not implement per-user OAuth into provider accounts. Provider authorization is the responsibility of whatever runs an ACP server, not of Kumite operators or end users.

## Out of scope, with pointers

| Topic | Tracked in |
| :--- | :--- |
| v0 match spec (player count, roles, rounds, scoring) | `Agent Kumite.md` §4, AK-5 |
| Benchmark protocol, hypotheses, baselines | `Agent Kumite.md` §5, AK-6 |
| Structured commitments schema | REC-04, AK-7 |
| Observation vs intervention separation | REC-08, AK-3, `docs/superpowers/specs/observation-vs-intervention.md` |
| Thought-trace labeling | REC-07, AK-4, `docs/superpowers/specs/thought-trace-labeling.md` |
| Roster identity / cast / model badges | REC-13, AK-10 |
| Pressure shell / tension director | REC-14, AK-11, `docs/superpowers/specs/tension-director.md` |
| Swift control room | REC-09, AK-14 |
| Discord RBAC and audit | REC-10, AK-15 |
| ACP client / orchestration layer / multi-session match mapping | FOLLOWUPS "Architecture and implementation" 1–4, 8 |
| `awaiting` as canonical human-nudge state | REC-12, AK-12 |

## Reconciliation with existing artifacts

- `Agent Kumite.md` §1 (Why this idea matters) — closes by pointing to this spec as the binding framing.
- `Agent Kumite.md` §4 (Phase-1 Thesis and v0 match spec) — leads with this spec; the v0 table remains the concrete instantiation.
- `Agent Kumite.md` §5 (Evaluation harness) — the falsification list here is canonical; §5 may continue to expand metric detail.
- `Agent Kumite.md` §9 (What transfers into real work contexts) — closes by citing the game-value / transfer-value contract above.
- `FOLLOWUPS.md` "Core product and research direction" — three items (frame phase 1, write the thesis, lock game-value vs transfer-value relationship) are answered by this spec and ticked.

If a future change updates the framing, it updates this spec first. Other artifacts are downstream.

[^acp-openapi]: ACP OpenAPI spec and run/session endpoints: https://agentcommunicationprotocol.dev/spec/openapi.yaml
[^acp-await]: ACP Await mechanism: https://agentcommunicationprotocol.dev/how-to/await-external-response.md
[^acp-metadata]: ACP message metadata including trajectory payloads: https://agentcommunicationprotocol.dev/core-concepts/message-metadata.md
[^werewolf-arena]: Werewolf Arena Benchmark and paper: https://github.com/SulmanK/Werewolf-Arena-Benchmark and https://arxiv.org/abs/2407.13943
[^meltingpot]: MeltingPot: https://github.com/google-deepmind/meltingpot and https://arxiv.org/abs/2211.13746
[^wolfcha]: Wolfcha project and site: https://github.com/oil-oil/wolfcha and https://wolf-cha.com
[^arenai]: ArenAI repository and site: https://github.com/plduhoux/arenai and https://arenai.plduhoux.fr
[^endless-werewolf]: Endless Werewolf repository and site: https://github.com/ShawTim/endless-werewolf and https://shawtim.github.io/endless-werewolf/
[^turpin]: Turpin et al., "Language Models Don't Always Say What They Think": https://arxiv.org/abs/2305.04388
[^sycophancy]: Sharma et al., "Towards Understanding Sycophancy in Language Models": https://arxiv.org/abs/2310.13548
[^sleeper-agents]: Hubinger et al., "Sleeper Agents: Training Deceptive LLMs that Persist Through Safety Training": https://arxiv.org/abs/2401.05566
[^battle-royale]: Battle royale design overview: https://en.wikipedia.org/wiki/Battle_royale_game
[^traitors]: The Traitors format overview: https://en.wikipedia.org/wiki/The_Traitors_(American_TV_series)
[^adaptive-music]: Adaptive music overview and techniques: https://en.wikipedia.org/wiki/Adaptive_music
