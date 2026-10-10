# RPG V2 — coordinated world-simulation release

**Status: STAGED. DO NOT DEPLOY OR MERGE THIS PR UNTIL THE USER REQUESTS THE BUNDLED RELEASE.**

Production runtime remains the Deno bridge; staging GitHub CI does not deploy Deno. Current authoritative game state on starting this batch: `V2-S0721`, Day63 18:21, Shura with Vesha in Selarin. Never infer a save change from a test.

## Bundled modules

- `world_process.ts`, `world_continuity.ts`, `world_scheduler.ts`: causal event, daily and staffed-milestone cadence; due faction agenda and next review. GM still determines genuine plausible outcomes, with bounded process attention and no player-centric world creation.
- `world_events.ts`: materialized cause/actor/active process/geography, template thresholds and weather; candidates alone never become historical events.
- `world_information.ts`: real carrier, knowing speaker, valid route and elapsed rumor latency before recipient receives *unverified* NPC_KNOWLEDGE.
- `work_demand.ts`: finite named employer, source clock, established template pay bounds, exact slots, timeframe and trust gate; player never auto-accepts work.
- `npc_behavior.ts`: agency/personality, independent goal, relationship history, personal memory, knowledge and open obligations in loaded actor scene.
- `physical_integrity.ts`: source inventory mass balance, no double physical items, waste accounting, custody evidence.
- `physical_passport.ts`: immutable per-item geometry, measured mass/density, valid strain radius; material must have an existing **time-locked** permanent-canon MATID record at the original transaction, so post-sale invented physical properties are impossible in new gameplay.
- `scene_routing.ts`: bounded, scene-matching participants; corrected stable NPC ID regex.

## Google Drive schema migration — already applied independently of Deno

TEMP RUNTIME spreadsheet `1dSoDxMQB6m8rJIlTJwpaXef8lbuQOdS8bFDeZQSDxtY` has the **empty** `PHYSICAL_PASSPORTS_CURRENT` table (sheetId `42551011`, A1:U600) with one header row. Existing CONTROL, PLAYER_RESOURCES, INVENTORY_CURRENT and SESSION_LOG are unchanged. It is GM-only and must not be rendered as Shura's identified material knowledge.

Exact headers (21, immutable order):
`Item ID | Material canon ref | Origin TX | Origin inworld time | Geometry kind | Length m | Width m | Thickness m | Radius m | Measured volume m3 | Measured mass kg | Density kg/m3 | Cyclic strain limit | Minimum bend radius m | Dimensions evidence | Material evidence | First custodian | First location | Status | Last verified TX | Notes`

Stable material registry in permanent `LIVE_CANON_INDEX`: `[MATID:material.vein_metal.native_v1|LOCKED:Day63 18:21:00|DENSITY:6100|CYCLIC:0.0125]`. These values refer to the existing canonical B2 material, not a newly invented ore. **LOCKED Day63 must NOT be treated as a document that existed at Shura's Day44 purchase.** For legacy Day44–63 components, preserve actual documented audit and provenance; do not silently re-certificate the early transaction. New parts/purchases after the lock must register GM-known actual geometry before processing or trade.

## Pre-release checks

1. Confirm the full GitHub Actions PR test suite is green on the **latest head**, not just earlier commits. Run `deno check main.ts` and `deno task test`.
2. Verify TEMP RUNTIME migration columns/headers exactly once; re-adding sheet is forbidden.
3. Verify permanent canon MATID anchor exists with correct LOCKED date and values. Never write a second independent material authority in GM PREGEN.
4. Review semantic transaction atomicity for `worldProcessEvents`, `majorWorldEvents`, `rumorRelayEvents`, `workDemandEvents`, and `physicalPassportEvents`. Verify no uncontrolled payouts, teleportation, or invented player actions.
5. Confirm live save identity and `worldTime` unchanged by meta work.
6. **One intentional merge to main → one Deno deploy.** Do not touch `.deno-deploy-trigger` for incremental staging commits. Never expose auth secrets.
7. Smoke-test production `runtime_health` and default `get_turn_context`: `worldActionDocket`, `worldContinuity.eventTriggeredActive`, correct automatically routed Vesha, same save/scene and resources. If any fail, stop before playing a committed turn.
8. For a real game action, GM resolves independent NPC/faction/process outcomes, passes causal semantic events, then checks committed post-state and renders HUD.

## Limitations / future scope

- The world action docket **requests independent GM resolution**; it is not a self-running high-frequency background worker. No world time moves unless a real semantic commit advances it.
- New market, rumor and major-event rows require concrete causal inputs; the engine deliberately refuses to synthesize arbitrary criminals, contracts, pay or public knowledge.
- Physical passports are exact tracked geometry/known stock facts; complex assembled bow root joint, cable and cam engineering still needs specific tested load/fatigue envelopes. Density alone cannot certify shot safety.
- Big-city scope must be supported by named districts, employer networks, map edges and independent demands; pregen job templates are not a second truth.
