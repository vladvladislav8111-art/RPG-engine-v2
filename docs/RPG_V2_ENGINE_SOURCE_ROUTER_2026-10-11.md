# RPG V2 — verified source router, archive inventory and release gates

**Audit date:** 2026-10-11. **Status:** operational index, NOT a second rule canon or mutable-state mirror. The directly linked Drive documents and committed runtime remain authoritative. The latest actual save must be queried afresh; do not use dated snapshots in this report as current values.

## Startup order

1. Call existing `RPG Runtime Bridge.runtime_health` then `get_turn_context`. Resolve material actor context with actorRefs and NPC context gate when needed.
2. Load the most-specific *active* permanent rule from the links below, not archived copies, not proposal tables.
3. For uncertain physical/world calculations use `simulate_world_v3` (8th Bridge tool), max 12 jobs, always same current expectedSaveId, result `committed:false`; validate all caller-provided facts independently.
4. Author semantic events, prepare if complex/high-stakes, call `commit_turn` only for a genuinely chosen player action/world consequence and verified sources, then `render_current_hud`.
5. Infrastructure auditing and dialog about game development do NOT advance time or Shura state.

## Physical authority / folders

- RPG V2 root: https://drive.google.com/drive/folders/1JlZjZSBZyiFpwpWMSXBKGShwEGOhN-eR
- **ACTIVE TEMP RUNTIME — ONLY live numeric/current state:** https://docs.google.com/spreadsheets/d/1dSoDxMQB6m8rJIlTJwpaXef8lbuQOdS8bFDeZQSDxtY/edit
- **ACTIVE GM PREGEN — indexed/materialized convenience, not parallel canon:** https://docs.google.com/spreadsheets/d/1C6FPVqwc-nmvJtOxDLEo-l3S5dUAw-W8554sRM-Frks/edit
- **PERMANENT CANON INDEX — persistent world facts and routing:** https://docs.google.com/document/d/11Edf2BL0agtH0M3XxMydoQd3kw4XRjFcfGta5EFXBvQ/edit
- Static canon folder: https://drive.google.com/drive/folders/1Kh4D4PfEqL4CQlGIUdNvZniHgcKZzsQE
- Permanent canon folder: https://drive.google.com/drive/folders/15bZ_6HunvnvhdaWwiHOawsARivFvtzY7
- Historical archives / preserved snapshots: https://drive.google.com/drive/folders/1q5P_SLEH0ECsHVO5edG_LuJEs-XXiRQV
- Preserved legacy session documents: https://drive.google.com/drive/folders/1REUqlQrIBWOH1_kjs3R5Pjq5i_uJPQ0t
- Preserved NPC memory archive: https://docs.google.com/spreadsheets/d/1SMJ7l44o3ROP4jFE7uI2X6Do8PDOZrukrRLvLvcAC8E/edit

## Canonical static-document jump table

- **START_HERE:** https://docs.google.com/document/d/1LtXEDL_YhBPmh0f5ZeVJBuTTBhfMvqOLkr8NXj4gGX0/edit
- **NONNEGOTIABLE_INVARIANTS:** https://docs.google.com/document/d/1vyRc5tSa_HZT3ltghaEPc_jp5Nfr36_raaWE-u5D4PA/edit
- **STATIC_02_ENGINE:** https://docs.google.com/document/d/1O9nMiIi4FLC2FcE8BgGaQKbKBFrd65ay1Ty3sfSxYJk/edit
- **STATIC_03_PROGRESSION_TITLES:** https://docs.google.com/document/d/19i-bjpzfDRFGg3-PmMXFKEomoiHd8Bs49_lS79lzYqk/edit
- **STATIC_04_ECONOMY:** https://docs.google.com/document/d/1Uuc6AOvWCG1femVoFlmx-mN3aKggw-pYEpK1en1vpkI/edit
- **STATIC_05_LANGUAGE_SOCIAL:** https://docs.google.com/document/d/1vI66jyAlGw3WY1MipTOPcl31et2qLLLoDPQHWvfCt9E/edit
- **STATIC_06_TIME_MAP_SURVIVAL:** https://docs.google.com/document/d/1kQzmNTAyzl8c-T9HLuA823aCsXy__o3-Uz3yKu47u1I/edit
- **STATIC_07_COMBAT:** https://docs.google.com/document/d/1TXz8Ha3bFSyZddqvOIhEh3AjadimfMaeMRbivESGaZM/edit
- **STATIC_08_MAGIC:** https://docs.google.com/document/d/1x3ao5nOAhTy_Ey7kDdbmKUwPLP-IC-kIxuI_qkR00n4/edit
- **STATIC_09_POLITICS:** https://docs.google.com/document/d/1hsAEDpcx-TyCE__UnBXFRjtJDLgjJeMlS4KgisUUIj4/edit
- **STATIC_10_ADVENTURES_REWARDS:** https://docs.google.com/document/d/11CS0qG4wDHCE-GBLeZK-KN7soIAYuxtSZ_7UQsWGcv8/edit
- **STATIC_11_INITIALIZATION_HISTORIC:** https://docs.google.com/document/d/1kx0wSsVQ7rH0msC-ou0JRMQOHGJ2l0jVLB-FoB_oXbQ/edit
- **STATIC_12_SCHEMA:** https://docs.google.com/document/d/1G92d0X8RwrifIhOaHPmPknpE4ySNe0NvmGTcZ1cdrFI/edit
- **STATIC_13_VALIDATION:** https://docs.google.com/document/d/18IwYSKwmkCFKeDZAtaXG2AmRwotdLJ99IbArcGl9FPs/edit
- **STATIC_14_PROGRESS_COMPACT:** https://docs.google.com/document/d/1TAqnmLLJ-j9C21IXxPaMQ9alE37yC5axtqVQAuQG8xg/edit
- **STATIC_15_TAREN:** https://docs.google.com/document/d/1hxnhzaFDD2ABQTOb2DiT6f79q91b0MOwG-h6svFn0zI/edit
- **STATIC_16_ADAPTATION:** https://docs.google.com/document/d/19CIfrAr4JOlv957E_FokVFyIGTrtBJDxak_5yaZYcLo/edit
- **STATIC_17_SUP_INTERFACE:** https://docs.google.com/document/d/1qxIgCJQQnT7EuoihyP2DIkiEojZvzLwyqYqDz9L600Q/edit

These are direct document locators, not an alternate cache of rules. SPECIFIC rules override generic summaries; current values always require runtime.

## Code, Site and staging

- Deployed Deno backend (requires server-held authentication for protected endpoints): https://rpg-engine-v2.vladvladislav8111.deno.net
- Existing Site RPG Runtime Bridge: https://rpg-runtime-bridge.vlad-vladislav8111.chatgpt.site
- Engine main source: https://github.com/vladvladislav8111-art/RPG-engine-v2/tree/main
- World Simulation V3 operations: https://github.com/vladvladislav8111-art/RPG-engine-v2/tree/main/src/world_sim_v3
- V3 source-bound adapter: https://github.com/vladvladislav8111-art/RPG-engine-v2/blob/main/docs/WORLD_V3_SOURCE_BRIDGE_AND_PLAY_GATE.md
- V3 bounded REST+MCP interface: https://github.com/vladvladislav8111-art/RPG-engine-v2/blob/main/docs/WORLD_SIM_V3_RUNTIME_INTEGRATION.md
- Older Deno-KV attachment diagnostics PR #44: https://github.com/vladvladislav8111-art/RPG-engine-v2/pull/44 — DRAFT, not deployed as production persistence proof
- ECON EC-06 stacked staging PRs #27–#43; these are not production writers: https://github.com/vladvladislav8111-art/RPG-engine-v2/pulls

## State of the major systems (2026-10-11 audit)

- **V3 calculation API:** in production, MCP tool `simulate_world_v3`, REST `POST /simulate/world-v3`, `READ_ONLY_PROPOSALS`. 20 operation kinds, max 12 jobs; source bridge verifies live clock and can filter grounded offers. This is NOT a verified semantic write adapter for arbitrary proposals.
- **Semantic gameplay writer:** existing engine commit/prepare pipeline remains authoritative. It already handles many exact numerical deltas, survival, XP, adaptation, inventory and state rows. Do not duplicate computation externally or invent a second writer.
- **Achievement and title *draft catalog*:** 90 candidate achievements, 27 candidate titles, not canonized/earned. Existing earned titles are only those in authoritative committed runtime. The active SUP rules in STATIC_17/STATIC_03 apply; no passive grinding, unproved retrospective backcredit, automatic purchases or double awards.
- **NPC opportunity generator:** source-only board screens current active opportunities, but a listing is NOT proof of source-funded wages; existing paid/closed opportunities cannot be regenerated as available.
- **EC-06 NPC-to-NPC economy:** staged only. No live cash migrations, no independent known starting NPC balances or exclusive-quiescence-controller proof, no production Google projection writer. Newly attached Deno KV `Connected` in Deno Deploy does not itself prove correct production timeline continuity across revisions. Do not execute staged settlement code on live accounts.
- **World agency:** live NPC actions must be based on each individual's actual knowledge/current goal/finite resources; V3 only proposes arithmetic, never chooses Shura's decisions.

## Audit findings / hygiene

1. The old Netlify production claims in historical README, `NETLIFY_MIGRATION.md`, and STATIC_12 schema were superseded by the confirmed Deno live backend. The archival text is preserved with prominent CURRENT ROUTING warnings, not erased.
2. STATIC_17 contains a historic line “10 SUP available, 0 spent” from an earlier rebalancing. It is NOT the live balance; consult `PLAYER_RESOURCES`/HUD. Never manufacture a corrective transaction from the stale statement.
3. Static 00_START_HERE includes older EC-06 PR37/PR38 sections. The later runtime V3 build and the newer draft EC-06 branches supersede those implementation *status* paragraphs, not the physical/gameplay rules.
4. The design bundles P/W/A/E/S have explicit `DESIGN_CANDIDATE` / `NEVER_IN_LIVE_PLAY` gates. No auto-canonization of species, classes, titles, NPC employments, money, routes, dungeons or quest objects.
5. Six exact `PRE_...` historical snapshot files were moved without file ID changes to `99_ARCHIVE`: 2 TEMP backups + 1 LIVE_CANON backup from root and 3 GM PREGEN backups. No destructive purge and no movement of ACTIVE TEMP, ACTIVE GM PREGEN, or permanent canon.
6. Existing 2026-10-11 open PR backlog includes many DRAFT economic/design branches with dependent bases. Never mass-merge, auto-close or deploy; audit dependencies one batch with isolated test data and source-funding proof.
7. Empty legacy folder `EMPTY_LEGACY_FLOOT — RPG V2 FILES` was checked and contains zero files; preserved as an archival pointer pending explicit owner's decision to delete.

## Release and recovery contract

- Verify Deno `runtime_health`, committed save, HUD/actor context, Google read/write credentials and authorized route.
- Deno Site continues to expose eight original/current tools; no new Site or Plugin required. Never put secrets into this document or client scripts.
- Exact state mutations only via current `semantic commit_turn` and durable SESSION_LOG verification. Preparation/diagnostics are read-only; don't change time.
- For EC-06 HELD Google writer locks, inspect read-only dossiers but DO NOT release locks without independent external writer quiescence proof. Never retry actual money transfer as if a failed projection meant the original ledger TX failed.
- Release in one reviewed batch after static/unit/contract checks, then verify current save unaffected by infrastructure-only testing. Preserve archived copies for incident recovery.
- Avoid maintaining the same mutable number in multiple files. Update links/roles in this router, actual data at original source only.

## Design-only packs

- **P-01/P-02/P-03/P-04/P-05:** planning only; no class/skill/title grant.
- **W-04/W-05; A-01/A-02/A-03; E-06:** candidate geography, creatures, materials and dungeons; no encounters/loot/route until canonized.
- **S-01:** NPC identity reconciliation partly canonized; extra staffing/census remains candidate.
- **V3 90 achievements / 27 titles:** runtime DESIGN_CANDIDATE; no automatic SUP or passives.

Historical copies, archived backups and V1 source seeds remain rebuild evidence, not live truth.
