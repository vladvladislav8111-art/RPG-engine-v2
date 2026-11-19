# RPG Lab: atomic promotion of original NPCs (2026-11-19)

The world can promote an original background NPC such as Ivar Kell after two **separately GM-confirmed, witnessed** events: a stable first meeting at a real workplace and an independent consequential choice. The GM supplies a private personality core, speech patterns, limits, and optionally safe adaptive axes. Neither a repeated purchase nor a conversational mention qualifies.

## Interface
- GM-only MCP write tool: `rpg_lab_promote_original_npc`.
- Authenticated HTTP endpoint: `POST /rpg-lab/v1/projects/{projectId}/sessions/{sessionId}/original-npcs/promote`.
- Require `confirm: "PROMOTE_CONFIRMED_ORIGINAL_NPC"`, `expectedPackRevision`, `expectedSessionRevision`, `seed`, and a complete `profile`.

The engine uses one Deno KV atomic CAS over **both** the world profile pack and the specific session snapshot. CAS also checks that no archive marker or Google Drive binding was created. For large session snapshots, immutable chunks are persisted before the atomic head update; on any CAS failure neither the new pack head nor the session head becomes visible. Stale revisions and duplicate promotions are rejected.

If the proof events rolled out of the active 240-event journal, only immutable, confirmed, same-campaign `event_refs` receipts can recover their facts. Old events are not restored to the journal. The promoted NPC receives the two relevant personal memories, not another actor's full memory, and no automatic trust, knowledge of hidden player details, money, XP, or clock advance.

No old Shura keys, unrelated RPG Lab session records or campaign archives are rewritten. The profile is shared at **project** level; memories and social changes are specific to one session. The route refuses Google-Drive-managed packs, which must instead be edited at the source, and archived campaigns.

## Operational safety
This release adds the capability only. It does not automatically install a new DanMachi world, create a session, or promote Ivar in a real saved game. Before a live promotion, use the current authoritative project/session revisions and established event receipts. Later mentions load the original NPC from the same profile retrieval path as canon characters.

CI exercises the actual Deno in-memory KV, successful dual-record writes, stale and duplicate writes, historical evidence, missing proof, archive/Drive gates and preservation of the legacy save key.
