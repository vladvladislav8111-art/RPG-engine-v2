# Continuation prompt — RPG V2 NPC Life & Personality V4

Continue the one-batch RPG V2 NPC life architecture work, avoiding new Site/Plugin and avoiding many deploy-triggering commits. Read RPG Runtime Bridge `runtime_health` then `get_turn_context` WITHOUT committing or moving Shura. Committed runtime is authoritative, permanent canon second, old logs third.

Find the latest branch/PR for NPC Life & Personality V4 in `vladvladislav8111-art/RPG-engine-v2`. Read `docs/NPC_LIFE_PERSONALITY_V4_BATCH.md`, the new pure TypeScript files under `src/npc_life_v4/`, and GitHub CI. Distinguish tested source code in a branch from anything actually merged/deployed: do not claim live activation without proof.

Objectives: meaningful interactions on **six separate committed in-world days** unlock nomination review as KEY, not auto-status. Meaningful interactions only, with exact historical TX receipts; no farming via repeated purchases, chat spam, five elapsed days, or duplicate identities. Existing KEY Max, Kirill and Irina remain KEY. Vesha and craftsmen remain RECURRING unless evidence+GM signoff proves promotion. There must be real independent NPC life, projects, daily constraints, knowledge-limited NPC↔NPC relationships, evolving human reactions without random fabricated drama. Keep active NPC attention limited and materialize only due processes.

The existing `simulate_world_v3` Bridge tool should use its existing `npc_decision` operation with optional `payload.lifeV4` sub-kinds, preserving the eight-tool Site identity. Every V4 result is READ_ONLY_PROPOSALS/committed:false and has no authority to award/transfer money/SUP/items/relationships without semantic commit and validated source.

Read current canon 05_LANGUAGE_NPC_SOCIAL_MEMORY, 00_START_HERE, 00A_GM_NONNEGOTIABLE_INVARIANTS, S-01/C-06 and live NPC_CURRENT/ACTIVITY_RULES and WORLD_CLOCKS. No changes to the game save during meta work. Before activating a promoted NPC, make `NPC_CURRENT.Importance=KEY` and the corresponding `NPC_ACTIVITY_RULES` source-backed rule atomic in an approved semantic commit, then verify context gate. Review authoring guides; do not invent personal backstory or new homes.

At the end, report exact live save/time unchanged, CI, PR status and remaining gates. User wants short latency in gameplay and one large tested integration batch, not micro-commits. Do not merge unless requested or safe user permission is clear. Continue no more than 20 seconds without a useful progress update.
