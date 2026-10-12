# RPG V2 — safe context overhaul stage (2026-10-12)

**Draft stacked upon PR #54 → #53.** Incorporates selected pure code and synthetic tests from draft PR #51 plus the read-only initiative/motives of PR #52; never the unproven writer changes. This is NOT a live-save migration.

## Wired into existing get_turn_context
- `packet.gmTurnBrief`, `gmTurnTriage`, `npcRoutineCadence`, `contextReadBudget` and on-demand `systemNotifications` are proposals from already loaded data. `actors[id].initiativePlan` uses actual current goals, NPC knowledge, relationships, memories and source-verified co-presence; zero fabricated historical stimuli. Existing `actors[id].contextHeat` remains source-gated shadow.
- Existing `SYSTEM_CONTACTS_CURRENT!A1:J200` is confirmed in TEMP RUNTIME and read in the original scene-routing batch request. Contact/inbox tags route only ACTIVE and consented Shura peers through existing bounded actor safety gate; offscene NPCs have their own life and are not forced to reply.
- `PENDING_CHOICES` is loaded in the original core batch for prompts; `PROGRESSION_EVENTS` only for explicit System Inbox. No choice is taken for Shura or canonical options fabricated. System notifications are a read-only rendering of source rows; durable ACK remains OFF.
- A deliberate `MICRO` inspection with nonempty safe tags and no explicit actor can omit incidental scene NPC reads; unknown/no tags and substantive play continue to load the full source-backed actor context. Scene pointers unchanged, authoritative actor context gate intact.
- NPC cadence derives from already read sparse continuity ranges and never turns a due review into an accomplished NPC act.
- Pure finite funding/custody and work competition checks, progression review and fast integrity audit are present as standalone staging modules; **they are not a new writer**.

## Blocked work until independent release gate
- `SESSION_LOG` actor-specific committed Heat evidence and derived index writer: no automatic materialization, no retroactive backfill, no Heat 2–4 inflation on unverified social memories.
- Safe distributed Deno multi-instance writer fencing, uncertain Sheets→Docs crash recovery, durable strict XP/milestone review, EC-06 funded jobs, and System notification ACK: all require independent TEST workbook/Preview E2E and explicit permission. Draft PR #51 cannot be merged wholesale.
- No changes in this PR to semantic writer, Google transport, configuration, secrets, HUD, MCP, endpoints or Site/Plugin identity. No production commit or save writes.

**Acceptance:** exact tree diff, `deno check main.ts` and full `deno task test` on this new HEAD; one atomic commit. Merge approval and Production deployment are separate future user decisions.
