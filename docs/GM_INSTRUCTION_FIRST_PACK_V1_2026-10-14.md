# RPG V2 — GM FIRST Instruction Pack V1 (2026-10-14)

User goal: every turn context request first carries a compact internal GM memo, then the original complete engine context. No separate plugin, endpoint, writable memory, or autonomous event.

Implementation: `get_turn_context` and REST `/context` return `gmInstructionPack` as the FIRST top-level field, ahead of existing `turnId`, `elapsedMs`, `packet`. The `packet` schema and MCP arguments are not changed. This preserves Bridge compatibility. The instruction pack is internal data, not a higher-priority system instruction; never render it as in-game text.

The fixed short prompt covers: Shura agency; separate GM, NPC, and player knowledge; native Taren speech and both-direction conveyed/understood semantics; grammar/lexicon gate; review General XP vs new learning for broad competence and specialization stars; justified new disciplines via canon and semantic unlock only; genuine repetitions decline; all relevant V3/npc_life/world/semantic engine stages; single-custodian financial integrity; continuity.

Read-only bounded SESSION_LOG source: `SESSION_LOG!A1:P1400`, loaded alongside the normal read batch. Up to four most recent confirmed gameplay log entries plus one earlier canon-change anchor, each max 210 characters, source-tagged. No meta/preview/test rows, future save IDs or invented log facts. If window is exhausted/malformed, mark history unavailable and route targeted log lookup instead of claiming a complete summary. The log is supplemental context, never live-state authority.

Open choices and source-derived due world processes add terse urgent reminders without choosing for Shura or claiming outcomes. For long chats, GM fetches narrow older canon/log fragments when needed; do not keep duplicating old mutable state.

Protection: no new Google writes or on-save row migration; no turn time advancement; no achievements, money, NPC-heat, promotion or SUP; no change to existing MCP tools, existing Site/Plugin/Bearer/URL; current `get_turn_context.packet` remains in the same shape.