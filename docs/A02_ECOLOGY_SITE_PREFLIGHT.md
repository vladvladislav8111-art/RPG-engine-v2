# RPG V2 — A-02/A-03 ecology and dungeon preflight (staging)

**Status: PURE VALIDATION ONLY. NOT A CANON MIGRATION. NOT A DENO RELEASE.**

Sources: Google Drive `RPG V2 — DESIGN A-02 — Фэнтезийная экология, залежи, объекты и торговые цепочки` (including the A-03 Western Ilyrian routes section), current `00_START_HERE — WORKING V2`, and existing permanent canon / runtime. The design document remains the source; this file is implementation guidance, **not a second bestiary or map**.

## What is implemented

- `src/ecology_gate.ts`: finite surveyed habitat area/density, plausible population range, annual births/deaths/migration recording, traceable natural mechanism and local harvest-law evidence, unique identity and existing-canon collision checks.
- Multi-species food accounting against **one shared finite verified annual source yield**, with a protected reserve. Multiple animals cannot independently spend the same annual prey/seed/biomass budget.
- `src/site_topology_gate.ts`: finite room geometry, one confirmed world-route entrance, actual legal access evidence, unique room/site IDs, reciprocal measured edges, full reachability, rejection of nonexistent/duplicate rooms and silent resets.
- A second independent admission check for each domain, gated on already committed canon/index/map/population/event provenance. **Both sets of functions are read-only.** A validated report never writes a table or shows the creature/dungeon to Shura.
- Regression tests: `tests/ecology_gate_test.ts`, `tests/site_topology_gate_test.ts`.

### Deliberately not implemented

- No `DESIGN_FANTASY_SPECIES` / `DESIGN_ILYRIAN_TAXA` / `DESIGN_ILYRIAN_SITES` row is promoted.
- No new `BESTIARY_MASTER`, population ledger, player map, `NPC_CURRENT`, location asset, process, offer, money, XP or loot is inserted.
- No fixed regional population figures, predator diets, prices, roads, room sizes or map distances are inferred from draft names.
- No production `commit_turn`, `prepare_turn`, Deno deployment or changes to the live save.
- This is a verification library, not yet hooked into all semantic runtime writes. Full enforcement needs explicit integration in a later reviewed change.

## Required inputs before a real activation

1. Obtain actual canonical bioregion/geographic anchors and survey each local habitat's area, density and population bounds. Draft bioregion IDs are **not** real location IDs.
2. Establish source-backed reproducible annual reproduction/mortality/migration and real food-resource yields, including concurrent consumers and a reserve. The returned net population change is for review, not auto-applied to the world.
3. Cross-check permanent species identity/function, biological mechanism and lawful extraction. Supply verified existing references, not invented `survey.*` IDs. The tests' synthetic `survey.ilyria.*` and `creature.ilyria.*` examples are **fixtures only**.
4. Independently commit the new species into the appropriate permanent canon and `BESTIARY_MASTER`, record real population instances/ledger and authorized materialization, and only then admit actual gameplay encounters.
5. For sites, survey the physical access point, land/legal rights, node dimensions and reciprocal distances. Do not overwrite any existing dungeon.
6. Independently commit site topology in the permanent map and a causal world event before it can be visited. Property and loot require separate finite custody records.

## Engineering release sequence

1. Stage source and tests on a feature branch / PR. Run GitHub Actions `deno check main.ts` and `deno task test` on the **latest** head.
2. In a later change, define source-backed structured indexes/headers and wire validation into the *semantic* commit path without changing current save semantics. Test dry-runs/migrations against fixtures first.
3. Only a successful reviewed release may be merged into `main`. The owner controls **manual Deno production deployment**. Confirm Deno GitHub integration is not configured to auto-deploy pushes.
4. Owner chooses the Deno deployment time. Then verify `runtime_health` / `get_turn_context` preserve save ID, world day/time/location, player resources and the unchanged accepted runtime. No live changes from this code-only validation stage.

## Design boundary

Ecological capacity and source budgets are *limits on possible world state*, not loot tables and not RPG difficulty scaling. An ecosystem can grow or collapse due to weather, hunting, disease, migration and changing land use only from actual causal process advancement. The preflight requires this information to be authored and verified; it does not synthesize outcomes or grant Shura hidden knowledge. The same principle applies to dungeon room graphs, finite assets, ownership and discovered/undiscovered map layers.
