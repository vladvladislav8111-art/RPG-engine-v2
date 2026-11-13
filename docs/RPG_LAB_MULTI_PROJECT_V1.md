# RPG Lab V1 — multi-project simulation workspace
Date: 2026-11-13.

## Implemented in isolated code
- Independent world packs keyed by project ID; versioned session snapshots keyed by project ID and session ID.
- Safe arithmetic formulas (no code execution): +, -, *, /, ^, min/max, abs, floor, ceil, round, sqrt, clamp; dependent formula references with cycle and complexity protection.
- Read-only operations: formula, resources, loot, harvest, progression, stat, economy, trade, craft, encounter, route, npc, world_tick.
- Loot has weighted entries, drop chance, quantity range and deterministic seeded previews. All rewards are pending independent source verification and semantic game authorization.
- A world graph with dungeon floors, weighted connections, exploration visibility and source-defined world process deadlines.
- NPC profile includes canonical source handle, traits, goals, known facts, speech style and possible event-driven emotions/motives. Reactions are hypotheses, not scripted mandatory actions or auto-written facts.
- CSV or JSON file import of formulas, prices, loot tables, resources and locations.
- Lab-only Deno KV CAS writes under prefix rpg-lab-v1, without legacy Shura state mutation.
- Browser UI: https://rpg-engine-v2.vladvladislav8111.deno.net/rpg-lab/v1/ui
  Key is entered on the page and not stored in browser storage.

## HTTP API with existing Bearer or x-runtime-key authentication
GET /rpg-lab/v1/projects
GET /rpg-lab/v1/projects/PROJECT
PUT /rpg-lab/v1/projects/PROJECT
POST /rpg-lab/v1/projects/PROJECT/import
POST /rpg-lab/v1/projects/PROJECT/evaluate
GET /rpg-lab/v1/projects/PROJECT/sessions/SESSION
PUT /rpg-lab/v1/projects/PROJECT/sessions/SESSION

Creating a pack: PUT body {"expectedRevision":0,"pack":PACK}. A new revision increments to 1.
Updating: pass previously returned revision as expectedRevision, update pack or import CSV.
Import CSV: POST body {"expectedRevision":1,"file":{"format":"csv","table":"formulas","content":"id,expression\nbonus,level*3\n"}}.
Calculating: POST body {"expectedRevision":2,"jobs":[{"id":"check.1","kind":"formula","args":{"formulaId":"damage","variables":{"attack":24,"defense":7}}}]}.
Sessions use the same explicit versioned pattern with {"expectedRevision":0,"session":SESSION}.
Optional sessionId in an evaluate request supplies current player stats, resources, known NPC facts and discovered locations when jobs omit them.

## Existing ChatGPT Runtime Bridge
No new tool required: use the existing simulate_world_v3 with a world_review job and payload.rpgLabV1 containing pack and jobs.
The existing Bridge still validates current Shura save ID as its read-only gateway token. The HTTP Lab interface does not depend on Shura save, so different projects are independent.
The Bridge does not automatically fetch packs stored in Lab KV: supply full pack inline through Bridge or use authenticated Lab API. Surface-level plugin remapping may be required to expose stored packs directly.

## Security and narrative guarantees
All arithmetic output: committed=false, sourceAttested=false, legacySaveTouched=false.
No rewards, money, NPC emotional facts, trait evolution, skills or world time are automatically committed. A seeded RNG result is not an authoritative kill/drop receipt. No narrative choice for the player is inferred.
CSV/JSON may configure project-local values but never execute JS or local file paths.
Psychological development remains canon-anchored, event-supported and subjective. Independent NPC Life V4 handles motives, bounded memory and longitudinal social interactions.

## Example files
examples/rpg_lab/demo_world.json: fully functioning isolated world with formulas, loot, economy, crafting, dungeon graph, NPC and scheduled processes.
examples/rpg_lab/demo_jobs.json: calculation and NPC event review jobs.
examples/rpg_lab/demo_session.json: versioned chapter state.
examples/rpg_lab/formulas.csv and loot.csv: editable import examples.

## Release gate
Deno checks and full regression suite required before the single production merge; after deploy verify current Runtime Bridge and isolated Lab endpoints separately. Existing Shura gameplay state should not be used for tests.
