# NPC Context Heat 0–5 — isolated read-only stage

**Status:** Draft, independent proposed release. Based on current `main` `8e715185da0ea975e14247ad1f706d6504d7f1b2`. Extracted only the pure heat calculator and its dedicated tests from draft PR #51; NOT based on PR #51 or PR #52.

## What is included

- `src/npc_attention_ladder.ts` exports `planNpcContextHeat(input)`, a deterministic advisory calculator consuming caller-supplied event receipts and a known world clock.
- `tests/npc_attention_ladder.test.ts` covers cold/visible actors, 24 in-world hour cache expiry, anti-farm routine contacts, per-scene and per-day caps, idempotent event deduplication and collision rejection, multi-day social evidence, independent NPC work, missing history, future/malformed events, and pre-existing KEY preservation.
- The derived `earnedTier` represents evidenced depth. `profileTier` is limited when historical receipts are incomplete. `activeTier` represents current relevance and may cool to 0 after a full 24 in-world hours; cooling NEVER erases NPC identity, relationships or history.
- Heat tiers are context-read priorities only: **0** background, **1** recently observed, **2** repeated substantive encounters, **3** meaningful social network, **4** sourced developed history, **5** existing committed KEY.
- A non-KEY actor requires six distinct days of verified meaningful social contact, complete evidence, stable identity and an activity rule **even to be eligible for GM promotion review**. Neither tier score nor this planner promotes an NPC or writes anything.

## Strict security and source boundaries

The input `committed: true` and the caller's `historyComplete: true` are NOT independent proof. Future adapters must verify receipts against actual committed SESSION_LOG / TEMP RUNTIME, proper actor IDs, documentary provenance and current world time; these tests use explicitly synthetic evidence. `meaningfulEvidence` is a screening hint, not proof of an actual relationship. No emotions, meetings, memory, contacts, transactions or new biographical facts may be inferred from the score.

This stage deliberately **does not integrate the heat planner into `get_turn_context`** or NPC loading, because a verified durable event receipt source and source-save-bound projection are not yet established. There are zero additional runtime reads, no new Google Sheets/Docs calls, and no runtime latency change until separately approved integration.

Do NOT import `npc_attention_load_router.ts`, `npc_attention_ledger.ts`, write receipts, materialize `NPC_ATTENTION_CURRENT`, enable KV lease, notification ACK, EC-06 or progression flags. No writer, config, auth, REST or MCP interface changes. Existing NPC Life V4 PR #52 and large PR #51 remain untouched.

## Follow-on gate (not authorized by this package)

First verify existing source receipts, world timestamps and existing KEY identities, then design a read-only `get_turn_context` adapter with bounded access and a fallback to complete authoritative NPC context for active scene participants. Only after those checks may a separate release add selective read routing; even that cannot truncate safety-critical actors, witnesses or meaningful NPC knowledge.

## Release safety

Run `deno check main.ts` and `deno task test` on the isolated PR and inspect its exact HEAD diff. Keep Draft until explicit owner merge authorization. No Production deployment or live-save writes are part of this task.
