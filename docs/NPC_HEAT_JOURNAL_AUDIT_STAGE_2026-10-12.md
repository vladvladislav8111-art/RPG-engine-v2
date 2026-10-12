# NPC Heat — bounded historical SESSION_LOG audit, candidate-only

**Draft.** This is the next safe component after merged PR #56. It adds an **opt-in** audit with `get_turn_context` tag `NPC_HEAT_AUDIT` and an explicitly requested NPC. Ordinary game turns gain **zero** new Google reads.

Current TEMP RUNTIME `SESSION_LOG` verified 2026-10-12 with 16 columns: `A Save ID`, `B Turn ID`, `C TX ID`, `D/E Inworld start/end`, `F Scene ID`, `J World advances JSON`, `N State hash`, `O Source`, `P Version`.

## Algorithm
1. Read `SESSION_LOG!C1:C5000` (narrow TX index) plus `A1:P1` header on audit only.
2. Pick **at most 128** most recent rows using exact `SESSION_LOG!A{start}:P{end}` range. Re-read `CONTROL!A1:D12` in the same second batch for source-save/time/scene stability.
3. Validate row schema, TX existence/uniqueness and index match, envelope `hash32(saveId|inworldEnd|scene|txId)`, source `ENGINE_FASTPATH`, version, chronological order, event ID and actor/time/scene/reference consistency, max 48 events/turn and 12 targeted actors.
4. Present only well-formed `engineNpcAttentionReceipts` as **unauthenticated candidates**. Any contradiction fails closed for the whole audit. Historical legacy rows with no engine receipts produce **zero** candidate events.
5. **NEVER** set `historyComplete=true` or count historical social days, award Heat 2–4, promote KEY, narrow NPC context, auto act or write state. Full history was not backfilled and older GM memories alone are not TX receipt evidence.

## Crucial provenance limitation
The **existing legacy `State hash` does not include `World advances JSON`**, so matching that hash is only envelope *self-consistency*, **not cryptographic content attestation**. A future safe semantic writer must include an engine-authored content digest/receipt chain under writer-locked source controls, verify uncertain commit/replay and multi-instance exclusion in isolated TEST fixtures **before** candidate events can become authoritative earned tiers.

No schema migration, new Site/Plugin/backend, bearer modification, economic writer or production deployment. Only separate Draft PR with full Deno CI; never write on Shura's save.
