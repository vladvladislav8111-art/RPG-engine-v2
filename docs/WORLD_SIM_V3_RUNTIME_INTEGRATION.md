# RPG V2 — World Simulation V3 read-only engine integration

STATUS: **calculation gateway connected**. Source canon, current save transaction, NPC source funds, titles, achievement activations and EC-06 financial writer are **NOT** migrated/activated by this integration.

## Purpose and entrypoints

- Existing server `POST /simulate/world-v3` behind the same `RUNTIME_API_KEY` as `/context` and `/commit`. Input `{ "expectedSaveId": "V2-S0721", "jobs": [{"id":"combat.1", "operation":"combat", "payload":{...}}, ...] }`.
- Existing MCP `/mcp` registers a new read-only `simulate_world_v3` tool with the same `expectedSaveId`/`jobs` contract. A private Site/Plugin wrapper may need separate tool-surface routing to expose this new tool; the Deno backend registration alone does not guarantee it appears in ChatGPT tool lists.
- `get_turn_context` includes a tiny `worldSimulationV3` capability descriptor. This does not load a citywide catalog, extra Docs, every NPC or historical economic tables.
- The gateway reads only authoritative `TEMP_RUNTIME CONTROL!B2` once per request to prevent stale-save assumptions and executes a bounded batch of **at most 12** pure calculations, each with a unique ID. 64 KB total request limit, arrays ≤128 elements; per-domain stronger bounds remain in source code. No asset money, character resource, system currency or physical items are changed.
- Result envelope always declares `committed:false`, `sourceAttested:false`, `requiresSemanticCommit:true`. The GM must use existing semantic `prepare_turn` → reviewed `commit_turn` with proper authoritative evidence for real state changes. Simulation results are **NOT** a writable financial/award transaction.

## Exposed operations

`turn`, `npc_presence`, `npc_decision`, `craft_advance`, `craft_qc`, `workshop_capacity`, `combat`, `travel`, `knowledge_relay`, `world_review`, `world_resolution`, `inventory_transfer`, `generate_offer`, `offer_board`, `achievement`, `title`, `progress_cycle`, `objective_reward`, `sup_purchase`, `title_effects`.

Examples of unavoidable data-provenance conditions:

- Travel requires Shura's *chosen* connected route edges supplied from canonical map; the engine does not select destinations.
- Craft cannot create finished goods until reserved material, real staffed minutes, and quality evidence exist. The number of elapsed minutes is not proof of craftsmanship.
- Offers require a materialized patron, escrowed budget and finite demand; deterministic seeded variants do not invent NPCs or funds.
- Knowledge relays need materialized facts, actual contact, and qualified provenance. Partial Taren comprehension never automatically reveals full content.
- Combat checks feasibility, not definitive wounds/HP; existing injury/stamina engine remains numeric authority.
- Achievement, title, objective rewards and title passives remain inactive **regardless of client-supplied activation lists**: only server-attested canonical activation can enable their live awards. This integration intentionally has NO authoritative award-registration bridge yet.
- SUP purchase calculations remain conditional on user-supplied inputs and **never execute a purchase**. Existing player SUP is authoritative in TEMP_RUNTIME.

## Security and rollout

No new Deno project, database, Google Doc or custom Site; no automatic scheduler, no additional financial writer and no cron. Authentication is inherited from existing `/mcp` and `/simulate/world-v3` routes. All new work is additive. Existing production semantics stay unchanged. A `WORLD_SIM_V3_ENABLED=false` deployment flag disables both new read-only entrypoints without changing other routes.

**Deployment must be deliberate:** one aggregate integration commit / one GitHub Actions run, ensure green regression before releasing. Test privileged calls only through trusted server-side authenticated tools — never include Bearer secrets in a user-facing URL or log. Runtime save `V2-S0721` must remain unchanged after meta/testing.

## Remaining gates before claiming full autonomous world execution

1. Source-grounded conversion of each proposal to existing `SemanticCommitPlan` fields with exact before/after and original custody, validated against actual runtime rows at commit-time.
2. Canonical promotion/registry of selected title+achievement candidates with explicit effects and no retroactive unreviewed SUP. A 90-entry *draft* catalog is not 90 issued awards.
3. Independent NPC world agenda/quest demand source materialization, capped offscreen progress and event receipts (no fake jobs/auto accepted quests).
4. Transaction integrity and fault-injection/replay tests for tool→semantic prepare→Google Sheets/Docs commit and idempotency, including quiescent independent EC-06 finance authorizer; newly attached Deno KV lifetime validation.
5. Private RPG Runtime Bridge Site mapping if MCP tool is not auto-discovered; a raw Deno MCP tool is not necessarily the Site's exposed tool.
6. Strict single release and rollback evidence; no automatic paid NPC↔NPC finance until the EC-06 cutover prerequisites are independently met.
