# Chroma RPG Lab v3.2 · Restore Hapjeong's canonical three stages

This repairs a **world-layout omission**, not a reset of the Player's session.
User correctly identified the very large blue-scaled creature beyond the
rail tunnel as the **approach to the final boss zone**. Chroma has NOT yet
entered combat with that creature. Preserve all source-backed events
through rev537, current System Lv7 XP1207, HP2396/2896, MP80/288,
fatigue36.46%, 47 DanMachi stones, System gold259.

## Original Solo Leveling route

- **B1 / first area**: Steel-Fanged Lycans (Raikans); repeated hunts,
  first System titles, possible reward drops.
- **B2 / second area**: Black-Shadow Razans (ground attackers) and
  Razor-Clawed Brigas (ceiling ambushers), in mixed groups. Monsters on
  earlier floors can respawn while Jinwoo hunts on another floor.
- **B3 / boss area**: Blue Venom-Fanged Kasaka. Reaching the enormous
  snake's approach is NOT equivalent to winning, triggering, or clearing.
- Leaving the sealed instance is possible through a truly obtained,
  one-use return crystal or through the completed boss clear.
- The Stone Golem from the same story arc occurs OUTSIDE the instance
  after Jinwoo returns. It is not a missing in-instance floor.

Reference evidence:
- Solo Leveling original novel chapter 13:
  https://archivedlibrary.com/story/solo-leveling-novel-official-english-translation/chapter/13/
- Original novel chapter 14:
  https://archivedlibrary.com/story/solo-leveling-novel-official-english-translation/chapter/14/
- Original novel chapter 15:
  https://archivedlibrary.com/story/solo-leveling-novel-official-english-translation/chapter/15/
- https://solo-leveling.fandom.com/wiki/Hapjeong_Subway_Station
- https://solo-leveling.fandom.com/wiki/Instant_Dungeon_Arc

## Mapping the Player's already established locations without teleporting

- First gray-tiled corridor + wolf hunts: B1.
- Enlarged gallery, side tunnel, empty service station/booth: connectors
  that may pass *beside* B2. These are **crossover navigation details**,
  not proof of having fought its canonical inhabitants.
- Lower metro platform, rail tracks, blue-scale sighting (last confirmed
  rev537 at D3 17:38): **B3 approach**. The Player has NOT faced the boss.
- Service stairs and/or the platform interchange still lead back toward
  the skipped B2. The Player may backtrack. This does not erase the
  sighting of the snake or forcibly redirect the Player.
- All B2 monsters are unseen until the Player actually approaches them.
  No presumed prior victories, combat skills, loot or XP.

## Mechanical repair, no retroactive rewards

- Add system.razan and system.briga to the first instance's actual
  System-encounter table, stage 2, real HP / threat / XP / attacks, with
  confirmed-entry and source-unique kill conditions.
- Mark system.kasaka stage 3, keeping its existing HP and boss-clear proof.
- Make a fresh wolf / Briga / Razan spawn use a NEW targetRef; previous
  defeated targetRefs cannot be farmed as duplicates. Respawns require
  elapsed time and a confirmed return visit in the GM scene.
- Canon-inspired Wolf Slayer title requires 10 DISTINCT confirmed system
  wolf victories during this instance. At rev537 there are only six
  confirmed wolves, so the title must NOT be automatically awarded.
  Once truly earned, +40% effective combat stats against eligible
  beast-types, not permanent stats or extra Falna points. Exact 10-kill
  threshold is this campaign's adaptation, not a claimed novel count.
- Return Crystal may appear as a chance reward from a verified
  system.dungeon_wolf drop search. It is **NOT guaranteed, not in the
  current inventory, and never awarded by reading this patch**. If found
  and consciously used while outside battle, its source-unique action
  consumes it, ends instance access as 'retreated', and grants no boss-clear
  reward. Do not claim a return crystal is presently available.
- No use of external/secret plot facts before the appropriate discovery.
- No new commit per monster or individual gameplay action. This release
  is a single unified GitHub commit and one push.

## Verification

On deployment, runtime_health must show
danmachi-solo-chroma-rpg-lab-v3.2-2026-11-23.
Run all repository tests plus Hapjeong-specific gates:
stages, B2 encounters, title proof, monster-type scope, no free crystal,
retreat not falsely treated as boss clear. A red CI is NOT a pass.
