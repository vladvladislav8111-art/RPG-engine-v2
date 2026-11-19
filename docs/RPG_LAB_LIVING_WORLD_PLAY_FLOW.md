# RPG Lab Living World — mandatory GM play flow (development branch)

**Not deployed.** This guide describes the new intended gameplay usage after the unified release is merged and deployed. No current live scene should assume these branch-only capabilities exist.

## One substantive NPC scene

1. Get the RPG Lab project ID, campaign session ID, and current revision from the actual isolated campaign. Never substitute a legacy Shura \`saveId\` for campaign state.
2. Query **the existing** RPG Runtime Bridge \`simulate_world_v3\` with operation \`world_review\` and \`payload.rpgLabSceneV1\`:
   - \`projectId\`, \`sessionId\`, \`npcIds\` (up to 8), optionally \`eventRef\`, \`featureIds\`, \`maxMemories\`.
   - The outer \`expectedSaveId\` is the bridge's current World V3 read-only gate, **not** the RPG Lab campaign revision.
3. Read the \`RPG_LAB_SCENE_BRIEF_V1\` packet: immutable traits, goals, mood, per-NPC features, remembered facts with provenance, previous decisions, and private responsibilities.
4. Derive NPC actions from those facts and motives. Do not simply agree with the player. Do not replace the NPC's canon with universal politeness. A refusal or grudge may persist. A personality flaw can be expressed without reducing the character to a one-note caricature.
5. Resolve actual interactions among NPCs, decisions on specific subjects, mood changes and discovered facts before writing prose. Narrative is the *rendering* of adjudicated events, not an unrecorded alternative outcome.
6. Commit a single \`rpg_lab_commit_event\` confirmed event at the real session revision with source-bound \`observations\`, \`features\`, \`npcInteractions\`, \`npcDecisionChanges\`, \`moodChanges\`, \`worldProjectChanges\` and \`worldActions\` as applicable. Only genuinely confirmed outcomes may be committed. Do not write tools on meta/design discussion turns.
7. On any commit/revision conflict, re-read the current campaign and reconcile rather than retrying stale data or silently inventing successes.

## Time passing while the player is elsewhere

1. Before advancing story clock, preview \`world_review\` with \`payload.rpgLabTickV1:{projectId,sessionId,toMinute,npcIds}\`. The starting time is read from **the actual RPG Lab session clock**. Max preview span: 7 days.
2. Evaluate any \`unresolvedProjectReviews\`, as well as canon-scheduled world processes and relevant NPC intentions. Finite capabilities and knowledge remain binding.
3. Commit source-backed progress, explicit refusal, or a concrete blocker with a new next review. \`applyConfirmedLabEvent\` refuses a time advance that silently skips an overdue active project. No automatic loot, experiments, money or social reconciliation from proposal output.
4. Independent NPC↔NPC actions may be recorded through \`npcInteractions\`. Both participants remember a real interaction; outside NPCs do not learn of it unless source-backed witnesses or relays exist.

## Example: rare thread samples

- Two 2 mm samples pass documented load tests: record **the measured observation**, not a universal theorem of material strength.
- One 10 mm sample is asserted to hold 25 tonnes, but the workshop lacks a rig: mark that property **untested**, not falsified and not proved.
- The workshop may take the research, decide to decline, prototype an item, seek tooling or reserve secrecy; those are decisions by the responsible person, not default player-friendly consent.
- If an accepted research process exists, assign an NPC, task, review time and stage. At Day 2/Day 3/Day 7, future checks review exactly what happened between those times. If no equipment exists, the blockage remains grounded and visible to the GM.
- Hephaestus does **not** magically know anything until a real relay reaches her, and a technical discovery does not automatically draw every god in the city.

## Example: hostile dinner exchange

- Bete may be offended by public humiliation; a later apology does not clear \`mood\`, \`relationships\` or \`priorDecisions\` unless a sourced change is recorded.
- Loki can show canonical impudence without narrator-enforced chastity or automatic flirtation in every scene.
- A private argument between two NPCs can be committed without the player even being in the same room; its participants retain the memory, other NPCs do not.

## Release and deployment safety

- One cohesive feature branch, tests on GitHub Actions, then human review, then **one** approved Deno production release. Not a deployment per tweak.
- Source-bound proposals are **read-only**. Legacy Shura saves, money, XP, Falna and RPG Lab unrelated campaigns stay unchanged until a correctly authorized isolated semantic commit.
- The universal module cannot itself generate brilliant dialogue or know every fictional canon. The narrator must reason in language over bounded private evidence; validation and regression tests prevent common continuity failures but do not prove perfect character interpretation.
