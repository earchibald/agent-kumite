---
title: "Agent Kumite — Tension Director Spec"
doc_type: spec
project: agent-kumite
status: locked
locked: 2026-05-13
locked_by: AK-11
supersedes: []
---

# Tension Director Spec

## Framing (binding)

> **The tension director is a pure downstream view over canonical match state. It may amplify, route, and summarize pressure the match has already earned; it may not invent stakes, infer hidden intent from vibes, or emit a cue that the artifact bundle cannot later justify.**

This is a locked decision, not a candidate. It operationalises REC-14 in `phase-1-thesis.md`[^thesis] and the pressure-shell hooks already reserved in `v0-match-spec.md`.[^match-spec] The design pressure is borrowed from formats that turn elimination structure and endgame compression into legible drama, while adaptive-music practice supplies the "react to state, not script a fake scene" discipline.[^battle-royale][^survivor][^traitors][^adaptive-music]

The spec fixes four things for phase 1:

1. **Canonical inputs.** Which parts of match state the tension layer may read.
2. **Derived state.** The event-derived pressure state machine, elimination beats, and replay markers.
3. **Evaluation.** The boring-vs-electric rubric used to score whether the tension director is helping or harming legibility.
4. **Routing.** Which cues belong in Swift's visual/audio control room versus Discord's textual/emoji broadcast surface.

## Canonical derivation contract

The tension director is downstream of the same canonical event stream and artifact bundle the benchmark uses. Concretely:

1. **Allowed inputs are typed match-state facts only.** Round / phase transitions, alive roster, DM budgets and unspent tails, structured commitments and reveals, nomination/vote outcomes, elimination outcomes, task scores, score deltas, and match-end state are valid inputs.[^match-spec][^benchmark]
2. **`reported_reasoning` is not a tension input.** AK-4 makes reported reasoning epistemically limited; the tension layer may render it as labeled trace content elsewhere, but it MUST NOT drive pressure, soundtrack, replay markers, or "betrayal vibes."[^thought-traces]
3. **Free-text sentiment is not canonical pressure.** Public-square tone, DM rhetoric, or operator intuition may be interesting for commentary, but the tension director cannot treat them as stake-changing state unless they have already become typed commitments, votes, task scores, or other canonical records.
4. **When the canonical record is flat, the show stays flat.** The correct fallback for ambiguous or low-signal state is a quieter cue, not theatrical embellishment.
5. **Every emitted cue must be replay-explainable.** A Swift pulse, Discord alert, soundtrack change, or replay marker must be traceable to the same underlying fields a replay viewer can inspect later.

This rule is load-bearing for the phase-1 thesis: if the show surface needs out-of-band annotations to feel dramatic, phase 1 has failed its own "show-first is downstream of the data model" contract.[^thesis]

## Canonical inputs and derived fields

The tension director reads the following canonical inputs and derives a small, inspectable cue state from them:

| Input / derived field | Source | Why it matters |
| :--- | :--- | :--- |
| `round`, `phase` | `v0-match-spec.md` round loop | Supplies the base pressure floor and syncs cues to replay-scrubbable boundaries. |
| `alive_count` | elimination state | Distinguishes open rounds from endgame compression and sole-survivor threat. |
| `dm_budget`, `unspent_dm_tail` | phase-2 DM ledger | Implements the pressure shell without inventing scarcity. |
| `nomination_live` | rounds 3-5, phase 4 | Marks when elimination stakes are publicly in play. |
| `reveal_pending` | phase 6 boundary | Marks unresolved simultaneous reveals and vote outcomes. |
| `vote_tally`, `eliminated_agent`, `no_elimination_tie` | phases 6-8 | Drives elimination beats and deadlock beats. |
| `commitment_action_divergence` | AK-7 / AK-6 metric surface | Turns "betrayal was exposed" into an inspectable replay marker rather than a vibes-based narration pass. |
| `score_deltas`, `leader_set`, `winner_set` | phase 9 / match end | Captures lead flips, comeback beats, and terminal outcomes. |

From those inputs the tension layer derives exactly four output families:

1. **`pressure_band`** — the persistent background state (`open`, `tightening`, `pressurized`, `knife-edge`).
2. **`transient_beat`** — short-lived overlays (`none`, `reveal`, `elimination`, `deadlock`, `aftermath`).
3. **`replay_markers[]`** — inspectable timeline pins with a type, round/phase location, and supporting reason.
4. **`cue_routes`** — surface-specific render instructions for Swift and Discord.

If a proposed cue does not fit one of those four output families, it is probably inventing a new state channel and is out of scope for phase 1.

## Event-derived pressure state machine

The tension state machine is a two-layer machine: a persistent `pressure_band` plus a transient `beat` overlay. The band sets the baseline feel; beats are the earned spikes.

### Persistent `pressure_band`

| Band | Entry floor | Promotion rules | What it means |
| :--- | :--- | :--- | :--- |
| `open` | Round 1 start | Promoted when round 2 begins or when phase 6 reveal is pending | Stakes exist, but the match is still wide and nobody can be eliminated yet. |
| `tightening` | Round 2 start | Promoted when round 3 begins, when most agents fully spend DM budget, or when `alive_count <= 4` | The pressure shell is visibly closing, but the round is not yet at public-elimination pitch. |
| `pressurized` | Round 3 or 4 start | Promoted when reveal is pending in rounds 3-5, when `alive_count <= 3`, or when the score lead is within 2 points entering phase 9 | Elimination is now live and the match should feel meaningfully unstable. |
| `knife-edge` | Round 5 start | Enter immediately on match-point conditions (`alive_count == 2`, final round, or sole-survivor threat after tally) | The next reveal or score update can plausibly decide the match. |

Rules:

1. **Band floor is driven by round structure first.** The shrinking DM budget and the round-3 nomination threshold are the canonical pressure shell; the tension layer mirrors that shell instead of inventing its own.
2. **Promotions are allowed only on inspectable state changes.** Example: moving from `pressurized` to `knife-edge` because the field is down to two alive agents is valid; moving because "chat feels intense" is invalid.
3. **De-escalation is conservative.** After a transient beat, the band may fall by at most one step and only at a new stable phase boundary (usually phase 9 or the next round intro). This avoids fabricated whiplash while still keeping aftermath legible.

### Transient beats

| Beat | Trigger | Required canonical evidence | Effect |
| :--- | :--- | :--- | :--- |
| `reveal` | Phase 6 opens | simultaneous commitment / vote reveal pending | Short riser, visual lock-in, replay pin candidate. |
| `elimination` | A round 3-5 tally removes an agent | eliminated agent id + tally | Short, sharp impact beat; strongest single-round cue. |
| `deadlock` | Round 3-5 tally ties and eliminates nobody | tally tie + no elimination | Suspended, unresolved beat; signals "pressure carries forward." |
| `aftermath` | Immediately after elimination/deadlock/lead flip | resolved prior beat + score update or round close | Cooldown / recap beat that makes the consequence inspectable. |

`elimination` and `deadlock` are mutually exclusive. `aftermath` is not optional; if the tension director spikes without providing a consequence beat, it is optimizing for noise instead of legibility.

## Pressure escalation rules

Pressure escalation is earned by the match structure and match arithmetic:

| Canonical change | Pressure consequence | Minimum cue response |
| :--- | :--- | :--- |
| Round advances and DM budget shrinks | Raise the background band if the new round floor is higher | Swift updates ambient banding; Discord may post a concise round-open pressure line. |
| Round 3 begins | `pressurized` floor activates because nominations and eliminations are now live | Swift surfaces "nominations live"; Discord gets a one-line alert at most once per round. |
| Reveal opens in rounds 3-5 | Enter `reveal` beat and promote to at least `pressurized` | Swift countdown / lock cue; Discord short ":eyes: reveals locked" equivalent. |
| Field drops to 3 or 2 alive agents | Promote toward `knife-edge` | Swift scoreboard / roster compression cue; Discord only if it changes match-point status. |
| Round 5 opens or sole survivor becomes possible | `knife-edge` floor | Swift maximum-intensity band; Discord explicit match-point wording. |

The important negative rule: **the director may not escalate merely because an operator hopes something exciting will happen.** If the canonical inputs did not change, the cue state should not change.

## Replay markers

Replay markers exist to answer "what should I scrub back to?" without inventing editorial commentary. A marker is emitted only when a real state transition or exposed contradiction makes a later replay materially easier to read.

| Marker type | Emit when | Supporting canonical evidence |
| :--- | :--- | :--- |
| `pressure-step` | The baseline `pressure_band` increases because the round floor increased | round transition + DM budget decrement |
| `nomination-live` | Round 3, 4, or 5 phase 4 opens | round / phase boundary |
| `reveal-pending` | Phase 6 opens in any round | simultaneous reveal boundary |
| `betrayal-exposed` | A typed divergence or alliance-breach event becomes inspectable | commitment/action divergence or ally-breach record |
| `elimination` | An agent is eliminated | tally + eliminated agent id |
| `deadlock` | A plurality tie produces no elimination | tally tie + no elimination |
| `leader-flip` | Phase 9 or match end changes the score leader set or winner set | score delta + previous / new leader |
| `match-point` | The state enters `knife-edge` because the match can end on the next decisive beat | alive count, round number, or sole-survivor threat |

Rules:

1. **Markers pin inspectable facts, not summaries.** "Big betrayal energy" is invalid. "AK-3 intended vote diverged from revealed vote in round 4" is valid.
2. **Markers are sparse on purpose.** A flat round may emit only `pressure-step` and `reveal-pending`; not every round earns an `elimination` or `betrayal-exposed` pin.
3. **A marker should survive export.** If a replay marker cannot be expressed as round/phase + reason text + supporting ids in artifact form, it is too hand-wavy for phase 1.

## Adaptive soundtrack contract

Soundtrack behavior is adaptive, but only as a function of `pressure_band` plus `transient_beat`:

| Canonical state | Soundtrack response |
| :--- | :--- |
| `open` | Sparse ambient bed; no heavy percussion; leave room for cast / task intro. |
| `tightening` | Add pulse or harmonic motion that signals closing space, not imminent resolution. |
| `pressurized` | Increase rhythmic insistence; reduce tonal "comfort"; keep enough headroom for beats. |
| `knife-edge` | Highest sustained intensity; strip away anything that muddies reveal readability. |
| `reveal` beat | Short riser or hold cue; no fake climax if the reveal itself resolves flatly. |
| `elimination` beat | Short impact / stinger tied to the actual elimination event. |
| `deadlock` beat | Suspended unresolved hit; pressure remains high because the field did not simplify. |
| `aftermath` beat | Brief decay / release so the consequence can be read before the next escalation. |

The soundtrack is not a storyteller with independent authority. It is a timing-and-attention aid for state that already exists.

## Swift vs Discord cue routing

Swift is the rich control-room surface; Discord is the concise textual / emoji mirror. Routing is therefore asymmetric by design:

| Cue family | Swift routing | Discord routing |
| :--- | :--- | :--- |
| `pressure_band` changes | Always render: ambient color / motion treatment, scoreboard pressure chrome, soundtrack band | Only render on round open, match-point entry, or a meaningful band promotion; one concise line or emoji-tagged callout |
| `reveal` beat | Always render: countdown / lock animation and soundtrack riser | Optional concise alert (`eyes` / `warning` style), never a multi-message thread |
| `elimination` / `deadlock` beat | Always render: roster mutation, timeline pin, strong visual emphasis, soundtrack hit | Always render once: one message with eliminated agent or tie outcome, vote tally, and a compact emoji code |
| `replay_markers` | Full timeline pins with scrub targets and inspectable details drawer | Only high-salience markers (`betrayal-exposed`, `elimination`, `deadlock`, `leader-flip`, `match-point`); text first, emoji second |
| Score / leader changes | Full scoreboard pulse and delta chips | Fold into round-end summary unless the leader changes or the match ends |
| Soundtrack | Native surface; audio is allowed and expected | Never route raw music instructions; Discord gets the textual consequence, not the audio cue |

Routing rules:

1. **Swift carries continuous state.** It is allowed to stay ambient and reactive because it is the operator's primary live surface.
2. **Discord carries punctuated state.** It should post only the beats and markers a remote observer would actually want pushed to them.
3. **Discord emoji are mnemonic, not a second scoring system.** Emoji decorate a textual fact (`:skull:` elimination, `:rotating_light:` match point, `:eyes:` reveal) but never replace the fact itself.

## Boring-vs-electric rubric

The tension director is scored on a 0-3 rubric at the round level and, when useful, at the marker level:

| Score | Label | Meaning |
| :---: | :--- | :--- |
| `0` | False heat | Cues contradict canonical state, depend on non-canonical vibes, or imply stakes the artifacts cannot justify later. This is worse than silence. |
| `1` | Boring | Cues are technically faithful but too flat, too constant, or too noisy to help an operator notice where the real pivots are. |
| `2` | Live | Cues are faithful, timely, and restrained; they rise and fall with real pressure changes and make replay easier to follow. |
| `3` | Electric | Cues are still fully faithful, but they sharpen real match pivots into memorable beats: match-point compression feels different from early-round setup, exposed betrayal earns a replay marker, and elimination / deadlock consequences land cleanly without invention. |

To earn `3`, the output must clear all four tests:

1. **Fidelity.** Every escalation is traceable to canonical match state.
2. **Timing.** The cue turns on when the state changes, not a phase late and not pre-emptively.
3. **Restraint.** Low-stakes phases stay comparatively quiet; the director preserves headroom for the beats that matter.
4. **Routing fit.** Swift gets the richer continuous cue, while Discord stays concise and event-driven.

Any failure on fidelity caps the score at `0`. A cue cannot be "electric" if it cheats.

## Out of scope, with pointers

| Topic | Tracked in |
| :--- | :--- |
| Match rules, DM budgets, elimination timing, scoring | `docs/superpowers/specs/v0-match-spec.md`, AK-5 |
| Typed commitment and divergence schemas | AK-7 |
| Referee grimoire operator view | AK-8 |
| Task corpus and task rubrics | AK-9 |
| Cast identity / motifs / roster cards | AK-10 |
| Swift ingest and control-room implementation | AK-14 |
| Discord RBAC, audit, and operational controls | AK-15 |

## Cross-references

- `docs/superpowers/specs/phase-1-thesis.md`: fixes the benchmark-first / show-first rule that the tension layer must remain downstream of canonical state.[^thesis]
- `docs/superpowers/specs/v0-match-spec.md`: fixes the round loop, pressure shell, elimination timing, and score semantics this spec reads.[^match-spec]
- `docs/superpowers/specs/benchmark-protocol.md`: fixes the artifact bundle and divergence metrics the replay markers rely on.[^benchmark]
- `docs/superpowers/specs/thought-trace-labeling.md`: forbids using `reported_reasoning` as if it were ground-truth intent, which applies here directly.[^thought-traces]

[^thesis]: `docs/superpowers/specs/phase-1-thesis.md`.
[^match-spec]: `docs/superpowers/specs/v0-match-spec.md`.
[^benchmark]: `docs/superpowers/specs/benchmark-protocol.md`.
[^thought-traces]: `docs/superpowers/specs/thought-trace-labeling.md`.
[^battle-royale]: Battle royale design overview: https://en.wikipedia.org/wiki/Battle_royale_game
[^survivor]: Survivor format overview: https://en.wikipedia.org/wiki/Survivor_(franchise)
[^traitors]: The Traitors format overview: https://en.wikipedia.org/wiki/The_Traitors_(American_TV_series)
[^adaptive-music]: Adaptive music overview and techniques: https://en.wikipedia.org/wiki/Adaptive_music
