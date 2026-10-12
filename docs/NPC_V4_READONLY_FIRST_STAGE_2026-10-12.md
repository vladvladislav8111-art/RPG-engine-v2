# First-stage release: source-backed NPC Life V4 (READ_ONLY_PROPOSALS)

## Scope
This branch is deliberately created from **main** `8e715185da0ea975e14247ad1f706d6504d7f1b2`, not from the writer-heavy PR #51. It lifts only two pure, source-verified NPC Life V4 calculators and connects one advisory `initiativePlan` field to existing per-actor `get_turn_context` output.

- `src/npc_inner_motives_v4.ts`: independent NPC inner-drive candidates. Witnessed fresh stimuli must have real source references and a current decision window; actual feelings/actions are **not** committed.
- `src/npc_initiative_v4.ts`: independent goal, duty, boundary, stance and possible spontaneous-speech proposals. Does not send a message, confer contact consent, infer reciprocal romance, create an obligation, invent language or choose for Shura.
- `src/context.ts`: use **already loaded** NPC_CURRENT, NPC_ACTIVITY_RULES, NPC_KNOWLEDGE, NPC_RELATIONSHIPS_CURRENT, SOCIAL_MEMORY_CURRENT and OPEN_THREADS_CURRENT. Set `observedStimuli=[]` until a separately reviewed committed source-ledger integration exists. Only same-scene participants in CONTROL-validated ACTIVE_CONTEXT count as co-present. Offscene contact is unverified, so `OUTREACH` is never proposed from this adapter. Return `null` for invalid IDs/time instead of changing an existing context response to an error.
- No extra Sheets/Docs reads; no new database, Google env variable, Site, Plugin or backend.
- No changes to `commit.ts`, `semantic.ts`, `google.ts`, `config.ts`, `schema.ts`, `types.ts`, `mcp.ts`, `http.ts`, `main.ts`, writer flag defaults, or live save.

## Compatibility and limits
The new field is **GM-only advisory**. It is not a `simulate_world_v3` call, is not an independently committed NPC act and does not advance the world clock. Actual NPC decisions and record changes continue through existing source checks, simulation, and semantic commit. NPC Context Heat 0–5 write index, transaction receipts, writer lease, EC-06, strict progression review and notification ACK remain in unmerged PR #51. This first stage **does not** claim complete NPC Life V4 or improved hotpath performance.

## Release approval
This is a **Draft PR** pending CI, review and explicit owner consent for merge and subsequent Production rollout. A passing isolated CI confirms source/tests compatibility but does not authorize Production. Verify `get_turn_context` through existing Bridge read-only after an approved deploy. Keep Shura's committed runtime unchanged and preserve all existing seven Bridge tool interfaces and server Bearer authentication.
