# RPG Lab: NPC Autonomy & Living World — Unified Release Contract

Status: **development branch only, NOT deployed, NOT merged**. No existing Shura save or RPG Lab campaign may be migrated or written during audit/test. The Deno deployment is **one cohesive release after all tests pass**, to conserve the 15-per-hour deployment quota. No piecemeal production deploys.

## Verified baseline (repository audit, 2026-11-19)

- `src/rpg_lab_v1/engine.ts` `world_tick` returns proposals with `eventsResolved:false`, `npcDecisionsMade:false` and `worldTimeAdvanced:false`.
- `src/rpg_lab_v1/autonomy.ts` proposes an agenda using canonical goals; proposals do not become history.
- `src/rpg_lab_v1/events.ts` has confirmed `worldActions`, `npcSocial`, `observations` and `features` writes.
- `src/rpg_lab_v1/npc_perception.ts` preserves feature-specific familiarity per NPC. Habit on one NPC does not imply knowledge on another.
- `src/rpg_lab_v1/session.ts` persists subjective memories and some contracts, but has no general verified world-project/process lifecycle with accountable owners and deadlines.
- `src/rpg_lab_v1/memory_view.ts` is privacy-aware; privileged GM views must never leak into player-visible text.
- Existing V3 calculator is `READ_ONLY_PROPOSALS`. The GM still decides, verifies and commits; no background/scheduled engine worker can be assumed.
- Do **not** reuse the unrelated RPG V2 Shura SAVE timeline as RPG Lab state.

## Definition of done: one integrated playable workflow

One turn must use this complete **causal pipeline**:

1. **Hydrate:** source-verified world facts, specific immutable canon personality, current NPC state, memory and active projects; include witness/relay provenance, not omniscience.
2. **Perceive:** determine what each NPC actually sensed, understood and considered important. Do not rely on player prose alone; separate observed demonstration, attributed claim, inferred consequence and unknown.
3. **Decide:** each NPC resolves own motives, temperament, existing commitments, resources, fatigue, relationships and priorities. The decision is not optimized for the player's comfort or agreement.
4. **Run offscreen work:** for elapsed *game time*, advance due work and relations among NPCs with bounded staff, tools and schedules. Decide progress, blocking reason, refusal or closure. No magical guaranteed progress or synthetic discovery.
5. **Adjudicate:** constraints/physics/canon are checked by the impartial adjudicator; refuse unsupported power, skip unearned achievements, prevent invented knowledge and contradictory obligations.
6. **Render:** storyteller may write natural language but must not override pre-resolved NPC outcomes or invent new independent actions.
7. **Commit:** one CAS-protected semantic event to the isolated RPG Lab campaign, with observed facts, subjective interpretations, open work, achieved stages, social fallout and evidence refs. Read-only previews remain uncommitted.

A read-only proposal is **not** a completed turn. The adapter must expose a hard signal `resolutionRequired` when any relevant process/decision remains unadjudicated. The GM cannot silently skip unresolved mandatory decisions while narrating that the world advanced.

## Required authoritative state surfaces

Build on existing `LabPack.npcProfiles`, `LabSession.npcs`, `LabConfirmedEvent` and Deno KV CAS. Do not introduce a duplicate NPC knowledge store or autonomous money writer.

**NPC identity** (from active canon only):
- personality anchors, conflicting values, persistent flaws, triggers, social habits, ethical and sexual temperament where canonical;
- competencies, responsibilities, interests, relationships and schedules;
- immutable canon anchors vs mutable justified development;
- these fields are **constraints**, not unconditional catchphrases.

**NPC lived state** (session):
- mood/emotional inertia with a cause, last changed event and natural decay conditions;
- motives, personal goals, directed NPC→NPC relationships;
- personal observation log / source-bearing belief with confidence and private/public access;
- witnessed special features per NPC, heard-about features separate from personally seen features;
- pending promises, projects and decisions owned by that NPC or their faction.

**World projects / activities** (session):
- `id, ownerNpcId/factionId, originRef, locationId, createdMinute, nextReviewMinute, deadlineMinute?, status, stage, knownInputs, unresolvedQuestions, resourceNeeds, blockerReason?, latestEvidenceRef, milestones`;
- statuses: `proposed -> accepted -> active -> blocked|completed|rejected|cancelled`;
- a **block** requires a concrete reason and a next decision/review, or a recorded terminal refusal;
- time advance checks the complete due queue (including newly created due stages) to a bounded horizon; retries are deterministic and idempotent;
- do not repeatedly replay overdue stages or perform work with impossible staff/resources.

## Anti-sterility policy

NPCs must act toward each other while the player is absent: gossip, disputes, collaborations, flirtation, jokes, avoidance, resentment and independent alliances when context justifies. Explicitly allow unpleasant moods and lack of reconciliation. Do not force hostility/sexualization on every scene; different characters have different frequencies and boundaries. The narrative is not a universal etiquette assistant.

NPCs may disagree with the player, insult them, refuse a deal or exploit an opportunity, if motivated and grounded. A single apology is not an automatic relationship reset. The player's viewpoint is **not** moral or epistemic authority.

## Significance / consequences

An event first receives a **consequence map** independent of how exciting the prose sounds:
- confirmed observations with witness IDs and proof;
- technical limitations and unknown quantities;
- plausible stakeholders, threat/benefit estimates and why the NPC has standing to care;
- which affected NPCs are actually informed;
- triggered personal goals, institutional workflows, safety/security/economic investigation;
- unknowns remain unknown, especially unmeasured impact against strong enemies.

**Do not force every NPC to be impressed**. Require a *character-consistent response* to facts they actually observed, including deliberate disinterest or an explicit reason for inaction.

## Three end-to-end acceptance fixtures (must be regression tests)

### A. Daedalus / atypical identity / first contact
- First-meeting god/npc with no prior encounter does not silently inherit another NPC's habituation.
- Halo, mechanical clock-hand eyes, unusual anatomy and the name Daedalus are separate observable features with possible world associations.
- Reaction varies by identity and context: curiosity, suspicion, recognition, lust, dismissal or mistaken explanation; **no compulsory admiration**.
- Repeat witness may become accustomed, but unusual detail cannot disappear from its factual state merely because 40 turns pass.
- Direct witness vs rumored report are not conflated.

### B. Rifle demonstration
- Verified: a remotely fired projectile passed through an actual iron breastplate on both sides and continued into earth; operator had no Falna (if independently verified).
- Unverified: measured muzzle velocity, exact terminal range, fatality vs Ottar, performance vs enchanted armor.
- A relevant witnessed technical/institutional NPC cannot dismiss all consequences merely because a chronograph was absent; they may dispute calibration while recognizing observed penetration.
- Potential security/market implications depend on stakeholder knowledge and incentives. No teleporting rumors.

### C. Hephaestus workshop materials
- 2×2 mm samples with tested 1,500 kgf loads; 1×10 mm sample **claimed** 25 tonne-force, not fully tested, if equipment insufficient.
- If the first two tests are verified, record their results; the third stays `unverified`, NOT `false`.
- An accepted investigation must create a stateful task with owner, next review, constraints and a possible path: non-destructive tests, prototype, escalation, lack-of-equipment investigation, reasoned cancellation.
- Simulate day 1/day 2/day 7 with **game-time** advancing. Tasks continue offscreen without the player needing to repeatedly visit.
- Evidence of Falna growth rate is an extraordinary research lead, not automatic validated indefinitely compounding material strength.
- The craftswoman or Hephaestus may decline, keep it confidential or request terms; none are required to worship the discovery.

## Non-negotiable regression and release gates

1. No old gameplay saves, balances, inventories, Falna values, awards or contracts mutated by preview.
2. Legacy gameplay state and RPG Lab KV prefixes remain isolated.
3. Every action/consequence carries valid source refs and witnesses; rumors require a grounded relay.
4. Retry and concurrent writes use CAS / idempotency; no duplicate processes, rewards or gossip.
5. Hidden NPC thoughts, offscreen outcomes and world action intents do not leak to player narration without discovery.
6. Narrative output checked against decided action, actual actor memory, established relationship, event results and canon anchors.
7. Capacity limits and narrative time jumps have deterministic bounded catch-up behavior; a missing instrument blocks only what it physically cannot test.
8. Existing tests, type-check and new scenario fixtures pass together on a branch; no deployment until release candidate passes.
9. One reviewed merge to main and **one planned Deno production deploy**, followed by health/read-only regression checks. No trial-and-error deploy loops.

## Implementation work in this single branch

- Extend Lab session/event schema with bounded NPC lived state and persistent world projects, including backward-compatible defaults.
- Add event-significance & stakeholder relevance reviewer; evidence-vs-hypothesis handling.
- Add evidence-gated NPC decision and mood/relationship transition with explicit non-consensus outcomes.
- Add deterministic due-world-project resolution and NPC↔NPC action batching; do not auto-commit results.
- Add mandatory process-pending gating in the existing Lab world tick and semantic CAS event path.
- Add narrator-facing private decision packet with consistency/knowledge checks.
- Add a compact diagnostics endpoint and tests for the three fixtures, CAS safety, private knowledge, delayed progress and narration consistency.

**No release from this branch until the full list is implemented and verified.** This contract is the planning artifact, not a claim that the new NPC module already works.
