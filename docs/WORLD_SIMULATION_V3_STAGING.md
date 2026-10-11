# RPG V2 — WORLD_SIMULATION_V3 (single offline development batch)

**Status:** `DESIGN_CANDIDATE / STAGING ONLY`. This package contains pure, bounded simulation planners, **not an alternative live save**. Its installation does not activate new titles, achievements, NPC autonomy, payment writers or gameplay rules. The existing production `semantic commit_turn` remains the only authorized writer until deliberate review, canonical promotion, schema migration and live tests.

**Validated source priorities:** committed Runtime Bridge `V2-S0721` Day63 18:21, then Drive `00_START_HERE — WORKING V2`, `03_CHARACTER_PROGRESSION_SYSTEM_TITLES_V2`, `17_SYSTEM_INTERFACE_SUP_V2`, `10_ADVENTURES_DUNGEONS_SYSTEM_REWARDS` and the existing GitHub main engine. Do not backdate candidate awards, create coins from draft paperwork, silently give an NPC GM-only information or change Shura's voluntary decisions.

## Implementation: one shared causal vocabulary

Each component accepts explicit **already materialized input** and returns a deterministic `SimOutcome`/semantic proposal, never an externally visible committed change. No I/O, `Deno.openKv()`, Google operations, timers, schedules, network requests, player selection or RNG that alters physical possibility.

1. `time.ts`: monotonic elapsed-world-minute windows, bounded active due-process docket, exact staff shifts and holidays, reject overlapping paid work hours. The caller must supply a **canonical weekday anchor** rather than invent the world's calendar.
2. `npc.ts`: deterministic **presence and capacity only** from a canonical shift and real accepted commitments. NPC intentions remain GM-driven, not random tables.
3. `craft.ts`: source-backed prepaid accepted orders, finite reserved materials, physical staffed effort / workshop capacity, separate quality-control approval and one-consumption products. Products do not appear from a mere due date; Shura must choose whether/when to collect.
4. `combat.ts`: reach, obstruction, visible exposure, stamina and armor feasibility first; NO invented wound/HP delta and NO lucky roll making an impossible strike possible. The existing injury and stamina engine remains the numeric authority.
5. `travel.ts`: player-selected canonical graph edges, distance, impediments, weather/load multipliers, fee affordability, known hazard references. Does not move Shura autonomously or create enemies.
6. `knowledge.ts`: time/source-tagged facts, actual contact and language comprehension, independently verified provenance; **partial Taren comprehension cannot leak full meaning**. Titles and public reputation do not grant telepathy.
7. `world.ts`: review ONLY due active world clocks and expiring materialized opportunities, return GM resolution requirements. No automatic arrests, faction victories, employer inventions or NPC quest acceptance.
8. `inventory.ts`: exclusive lot identity, source custodian, reservation accounting, conserved mass and unique receiver identity. Exact money/lot transfers await primary transaction authority; no redundant truth copies.
9. `progression.ts` + `achievement_catalog.ts`: 90 **draft** achievement definitions, 27 **draft** rare titles with explicit contextual effects, ordinary 0–2 SUP **only after canonical activation**, verified novel qualifying event(s), once-only reward origin and independent GM approval. Formal accepted System objectives may award 1–3 SUP after proven novel completion, independent from employer wages. Three new meaningful tasks over two distinct domains form an Independent Progress Cycle (1 SUP), with consumed evidence and cycle uniqueness. Existing SUP purchases require explicit player choice and funded balance. No old-balance rewrite.
10. `opportunities.ts`: 17 source-bounded quest/order template types; deterministic seeded variants choose effort and remuneration **only within physically posted, sufficiently funded issuer demand**, reserve per open slot, reject repeated escrow reuse. A proposed offer is NOT acceptance, completion or a SYSTEM reward.
11. `orchestrator.ts`: bounded `RPG_V3_WORLD_SIM_PROPOSAL_V1` with expected save ID, elapsed time, due clocks and real evidence. All results carry `committed:false` and need the existing semantic prepare / validation / commit path. Meta conversations advance zero time.

## Explicit non-goals / prevented duplication

- **No new production endpoint** and no invocation of `commit_turn`. These modules are not imported by `main.ts`, so push/deploy cannot silently change game rules.
- Do NOT replace the actual `src/physiology.ts`, `src/survival.ts`, `src/rules.ts`, `src/semantic.ts`, `src/world_scheduler.ts` or existing actual skill XP logic. Extend the semantic dispatcher only in a separately reviewed cutover after output maps and authoritative ledger changes are proved.
- Source/lot/escrow evidence is validation input, not permission to invent stock or credit. EC-06 remains independently blocked by quiescence/writer exclusion and authenticated migration.
- Real procedural quest availability requires a materialized issuer, economic demand, source/physical stock, actual relevant location, budget and non-expired window. A template library is not a source of real quests.
- Character achievements and titles are **draft candidates**. Their draft names do not retroactively create progress, Titles do not occupy an equipment slot, and `SOCIAL_HOOK` effects still require ordinary physical/reputational dissemination. Never auto-award SUP for repetitive safe farming.
- No generation of Taren lexemes or unfamiliar language without permanent canonization.
- No random unbounded city simulation per small interaction. Use bounded pages and only causally active world processes.

## Deployment procedure (single large reviewed cutover, NOT per module)

A. Finish this offline pure domain package and locally test with TypeScript type checking, native Node test runner and property/fuzz scenarios. Use one repository tree/commit to minimize automatic Deno Deploy triggers; do not deploy main.
B. Run one consolidated GitHub Actions regression check on that one commit/PR. Verify existing tests as well as new tests. An external Deno rate limit is not a test failure; wait for quota or disable preview auto-deploy before integrating.
C. Canonically review candidate achievement/title definitions and exactly priced System reward bands. Activate chosen entries individually in permanent canon and materialize catalog read indices; **zero retroactive currency updates** without a source-by-source audit.
D. Build a bridge from these proposals into the current `semantic commit` with authoritative row snapshots, CAS/save-ID checks, exact item custody and SYSTEM reward idempotency, then fault-inject and compare replays. Test the already-attached Deno KV on its REAL production timeline without enabling EC-06.
E. Only when proven safe, one deliberate reviewed production release. Do not confuse a green local unit suite with a live migration or independent Google writer-quiescence evidence.

## Expected test report / synthetic examples

The included tests exercise no 2-location NPCs, no impossible attacks, no phantom stock, no wrong-time knowledge, no unstaffed craft completion, no payout above reserved budget across remaining slots, no duplicated SUP receipt and no automatic title activation. The code remains intentionally inert until explicitly wired into current semantic commit architecture.
