# RPG V2 — Stamina action catalogue V2.1 (proposed implementation)

Date: 2026-10-13. Code implementation in `src/physiology.ts`. This document is a balancing specification; it does **not** commit a campaign turn, mutate Shura's save, update GM PREGEN or deploy production. Use only after engine release and authoritative `ACTION_STAMINA_PROFILES` catalogue synchronization.

## Meaning and accounting

- `currentCost` is the **unmodified exertion baseline** in the unit shown, not the final charge. `resolveExertion` also accounts for Endurance, relevant competence, load, environment, condition and special effects.
- `ceilingCost` is independently computed long-term accessible-Stamina loss; it is **not** another immediate current-Stamina charge. Full recovery must still obey the rest/survival model.
- The same physical movement is accounted **once**. An action already priced as loaded walking/heavy carrying is not billed again as normal walking. An exchange profile includes its routine motions; adding a separately resolved dodge/block is appropriate only when the exchange baseline explicitly excludes that maneuver.
- For mixed work, break elapsed time into physically distinct, nonoverlapping stages: manipulation, travel, exertion, waiting and rest.
- A horse's fatigue and speed are independent from the rider's Stamina; these rider rates do not make the mount tireless.
- Species physiology and injuries can override the human-style baselines. There is no automatic benefit merely because an actor is Shura.
- The unit `per exchange` describes one meaningful combat exchange; it is **not** a second cost automatically added to each attack, block and parry.

## Travel / movement

| Action | Profile / modifier | Base Stamina |
| --- | --- | ---: |
| Stand | `action.stand` | 0.2/hour |
| Slow walk | `action.walk.slow` | 1.0/hour |
| Normal walk | `action.walk.normal` | 1.5/hour |
| Fast walk | `action.walk.fast` | 2.5/hour |
| Walk with ordinary load | `action.walk.loaded` | 3.0/hour |
| Walk with heavy load | `action.walk.heavy_loaded` | 5.0/hour |
| Jog | `action.run.jog` | 0.5/min |
| Fast run | `action.run.fast` | 0.8/min |
| Sprint | `action.run.sprint` | 1.5/min |
| Run with a load | normal run profile, `loadMultiplier=1.5` | ×1.5 |
| Sustained uphill | appropriate walking profile, `environmentMultiplier=1.5` | ×1.5 when gradient actually requires it |
| Difficult downhill | appropriate walking profile, `environmentMultiplier=1.2` | ×1.2 only on demanding descent |
| Calm swim | `action.swim.calm` | 0.5/min |
| Normal swim | `action.swim.normal` | 1.0/min |
| Fast swim | `action.swim.fast` | 2.0/min |
| Easy climbing | `action.climb.active` | 1.0/min |
| Difficult climbing | `action.climb.difficult` | 2.5/min |
| Mounted walk (rider) | `action.ride.walk` | 1.0/hour |
| Mounted trot (rider) | `action.ride.trot` | 2.0/hour |
| Mounted gallop (rider) | `action.ride.gallop` | 4.0/hour |

No universal underwater breath-holding cost has been adopted. Buoyancy, holding position, exertion and oxygen time require separate causal handling; breath-holding is not priced as full-speed swimming.

## Manual work

| Action | Profile | Base Stamina |
| --- | --- | ---: |
| Light work | `action.work.light` | 1.0/hour |
| Medium work | `action.work.medium` | 3.0/hour |
| Heavy work | `action.work.heavy` | 7.5/hour |
| Very heavy work | `action.work.very_heavy` | 12.0/hour |
| Digging | `action.work.dig` | 8.0/hour |
| Chopping timber | `action.work.chop` | 9.0/hour |
| Active smithing | `action.work.smith` | 7.0/hour |
| Stoneworking | `action.work.stone` | 10.0/hour |
| Carrying heavy goods | `action.work.carry_heavy` | 6.0/hour |
| Heavy push/pull | `action.work.push_pull` | 8.0/hour |

Historical generic `action.work.dig_chop` (6.0/hour) is preserved for compatibility, but new tasks should choose the actual `dig` or `chop` profile. Actual hours of an occupation are not assumed to be continuously heavy exertion.

## Combat / weapons

| Action | Profile | Base Stamina |
| --- | --- | ---: |
| Light weapon exchange | `action.melee.light_exchange` | 0.8/exchange |
| Ordinary exchange | `action.melee.exchange` | 1.0/exchange |
| Heavy weapon exchange | `action.melee.heavy_exchange` | 1.5/exchange |
| Ordinary spear/polearm exchange | `action.melee.polearm_exchange` | 1.0/exchange |
| Dodge | `action.combat.dodge` | 0.5/exchange |
| Block | `action.combat.block` | 0.7/exchange |
| Parry | `action.combat.parry` | 0.6/exchange |
| Combat dash | `action.combat.dash` | 0.8/exchange |
| Bow shot | `action.bow.shot` | 0.35/shot |
| Bow hold | `action.bow.hold10` | 0.15/10s |
| Crossbow trigger | `action.crossbow.shot` | 0.15/shot |
| Hand reload (light crossbow) | `action.crossbow.reload` | 0.65/reload |
| Throw light object | `action.throw.light` | 0.4/throw |
| Throw spear | `action.spear.throw` | 0.5/throw |

Legacy `action.combat.heavy_swing` is aligned to 1.5/exchange. A high-draw-weight crossbow or winding mechanism needs its own reload profile; no universal 0.5 combined shot + reload cost. A spear is not automatically more tiring than a sword simply because it is a polearm.

## Conditions: no unsupported automatic penalties

- Cold exposure may increase cost where it **physically** impairs movement; no unconditional ×1.2 just for cold weather.
- Heavy armor affects actual mass, fit, range of movement and exertion; no flat ×1.5 in every exchange, and never multiply the same load twice.
- Darkness primarily affects perception, targeting and movement decisions; no automatic ×1.3 Stamina penalty.
- Terrain and load multipliers are given as concrete `resolveExertion` input factors; they must not be applied again when already baked into the selected base profile or travel model.

## Runtime boundary

The engine's authoritative commit path uses registered action IDs; requests that cite non-existent IDs fail. The contextual GM PREGEN `ACTION_STAMINA_PROFILES` table is a separate read source and must be synchronized during an approved release. Do **not** silently mutate current Sheet rows or live saves from this draft branch. Existing HP/Stamina maxima, rest and recovery algorithms are intentionally unchanged by this release slice.
