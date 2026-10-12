# NPC Heat ledger / inner motives: staged branch integration

All confirmed gameplay transactions now write **engine-authored** `engineNpcAttentionReceipts` inside the existing SESSION_LOG World advances JSON, as part of the same semantic manifest (no second event writer). Duplicate TX is resolved by the existing durable replay path before the receipts can be built again. Only materialized NPC_CURRENT identities receive receipts; scene presence and actually submitted social/relationship events are distinguished. Social memories do not imply reciprocal relationships or feelings.

The **optional** `NPC_ATTENTION_CURRENT` derived index uses the columns exactly as declared in `src/npc_attention_ledger.ts` (`NPC_HEAT_INDEX_COLUMNS`). It is updated in that same semantic transaction and can be reconstructed from engine receipts in SESSION_LOG. It is **disabled by default** using `RPG_NPC_ATTENTION_INDEX_ENABLED=false`. DO NOT enable it until an isolated copy of the real TEMP workbook contains that sheet, the full Google/KV and concurrent writer tests pass, and the existing writer exclusion contract is verified. There is no automatic schema migration on production. No release writes to Shura's live save. The new index records post-activation evidence only, never inventing old history or promoting any NPC to KEY from a score.

When index is enabled, get_turn_context exposes `npcAttention` per actor and `npcAttentionReadPlan` advisory. The existing full deep-context gate is **not bypassed** for NPC substantive decisions; the index read plan is not yet a replacement for bounded context loading. A newly committed social memory can supply a **neutral, source-backed NEW_INFORMATION hint** to NPC inner motives during its decision window; all reactions remain GM proposals and require a separate, actual semantic action if performed. No inferred love/romance, free speech action, job, asset or player consent.

## Release gates
1. Deno check and Deno tests including new journal/idempotency/cooling tests on GitHub Actions.
2. Isolated genuine Google Sheets/Docs/KV writer E2E with a dedicated test workbook and concurrent commits, recovery and collision cases.
3. Install and validate index tab schema in a controlled release, explicitly enable index flag only after writer E2E.
4. Confirm performance measurements and safe selective hydration on non-critical bystanders before turning an advisory read plan into a hotpath shortcut.
5. Preserve existing Site/Plugin identity, server Bearer auth, EC-06 restrictions and live Shura save.

Do not infer that a green GitHub Deno CI is proof of production writer safety or that the optional index is active.
