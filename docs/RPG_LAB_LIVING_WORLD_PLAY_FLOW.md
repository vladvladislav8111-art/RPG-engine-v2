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
6. Submit the adjudicated outcome as one **source-verified** \`rpg_lab_commit_event\` at the real RPG Lab session revision, using \`observations\`, \`features\`, \`npcInteractions\`, \`npcDecisionChanges\`, \`moodChanges\`, \`worldProjectChanges\`, \`worldActions\` and optional typed \`worldEvidence\`. A claim remains \`reported/unverified\` until a separately confirmed test.
7. Re-read the campaign revision and send **\`rpgLabNarrationV1\`** (same existing \`simulate_world_v3/world_review\` route) containing \`projectId,sessionId,npcIds,expectedSessionRevision,contextEventRef?,beats\`. Each beat names the actor, source-backed \`factRefs\`, witnessed vs reported feature knowledge, any \`worldClaims\` and previous topic-specific \`decision\` claims.
8. Do not render an NPC beat as settled if \`readyToRender:false\`. Resolve \`FOCUSED_EVENT_IGNORED\`, \`FIRST_SIGNIFICANT_FEATURE_IGNORED\`, \`TRANSFORMATIVE_EVIDENCE_IGNORED\`, \`UNVERIFIED_CLAIM_UPGRADED\`, missing knowledge or incompatible decisions. \`readyToRender:true\` verifies **structured provenance metadata only**, **not** whether free-form dialogue is in character.
9. Render the confirmed consequences, without a parallel narrator invention. On CAS conflict reload and reconcile rather than re-using stale decisions. Meta/design discussion does not advance in-world time.


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

## Persistent protagonist identity and unusual appearance

- The \`LabSession.player.visibleFeatures\` registry stores player-approved, revisioned identity cues (e.g., Daedalus's visible halo and clockwork eyes). It does **not** mean any NPC has seen them.
- Register or update cues only using a sourced \`character_setup\`, \`continuity_repair\`, or player-authorized \`player_turn\` with \`playerFeatureChanges\` and matching \`expectedRevision\`. Removing a feature is explicit and source-backed; narration cannot quietly erase it after 30 turns.
- Every GM-only scene brief automatically includes **obvious** cues as potential first sightings, even when the NPC has no previous feature memory. Hidden/conditional forms require explicit visibility context.
- Commit a witnessed \`features\` observation for each NPC actually seeing the cue. Only then may narration assert firsthand familiarity, and focus-event reviews can require acknowledging a remarkable first sight.
- Do not interpret the candidate cue as proof of visibility through walls, disguises, darkness or absence. GM must adjudicate actual line-of-sight and context.

## Scoped proofs, including unsupported claims

- \`worldEvidence\` is saved per explicit event and has \`kind\` (observed/measured/reported/hypothesis), \`level\` (established/provisional/unverified), \`scope\`, witness list and optional test \`method\`.
- Verified 2 mm tensile tests **do not** establish untested 10 mm strength. Observed armor penetration **does not** establish muzzle velocity or effects on high-level gods.
- An NPC can learn of a verified test second-hand by a source-backed relay, but the narrator must not claim **firsthand** technical confirmation when that NPC never witnessed it.
- In a scene focused on a saved transformative event or a first remarkable feature, at least one relevant structured beat must acknowledge it. The actual emotional/social response still depends on the character, not automatic awe.
- All GM-visible context remains private. Player-visible prose may only reveal independently observed, spoken or discovered information.

## Release and deployment safety

- One cohesive feature branch, tests on GitHub Actions, then human review, then **one** approved Deno production release. Not a deployment per tweak.
- Source-bound proposals are **read-only**. Legacy Shura saves, money, XP, Falna and RPG Lab unrelated campaigns stay unchanged until a correctly authorized isolated semantic commit.
- The universal module cannot itself generate brilliant dialogue or know every fictional canon. The narrator must reason in language over bounded private evidence; validation and regression tests prevent common continuity failures but do not prove perfect character interpretation.
