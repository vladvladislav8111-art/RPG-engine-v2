# Crafting V4 — single release (2026-10-13)

Status: production calculation code, calibration examples only. No migration or retroactive changes to Shura's save, no new Deno Site, backend, key or MCP tool identity.

## Labor, stages, and queues
* Stage kinds: active (worker labor), passive (real elapsed curing/drying), inspection (worker labor followed by independent quality gate).
* Stage norm = setupMinutes + quantity x unitMinutes. Batching shares setup effort only. Delivery dates depend additionally on NPC availability, sourcing, workdays and queue.
* Reference spoon from a prepared dry wood blank: 60 baseline active minutes, or 115 minutes for two (shared setup).
* Reference 1.1m cord from prepared yarn: 55 baseline active minutes including inspection; NOT raw flax processing and NOT a certified load-rated bowstring.
* Reference glued handle: required 180 real curing minutes separately from shaping, assembly, inspection. Skill never accelerates curing.
* These reference recipes are calibration benchmarks, NOT items known or unlocked by Shura, NOT new obligations for Heren and NOT verified world production facts.

## Work speed
Star rate from 0 through 10:
0: .65 | 1: .75 | 2: .85 | 3: .95 | 4: 1.10 | 5: 1.30 | 6: 1.55 | 7: 1.85 | 8: 2.20 | 9: 2.60 | 10: 3.20.

BASE_SPEED = clamp(STAR_RATE * COMPETENCE * ATTRIBUTE * SUPPORT, .30, 4.50).
COMPETENCE = level==0 ? .90 : 1+.03*min(12,level-1).
ATTRIBUTE = clamp(1+.03*(value-5), .75, 1.30), so ordinary characteristic 5 has no penalty.
SUPPORT = 1+.01*source-verified bounded task support score.

STAGE_SPEED = clamp(BASE_SPEED * FAMILIARITY * TOOL * CONDITION, .30, 4.50).
FAMILIARITY = 1+.02*min(10, distinct genuinely completed and matching recipe receipts); max +20%. Planner receipt IDs are NOT authoritative; GM independently verifies same maker/recipe/success/no replay, or uses zero.
TOOL is .60 to 1.50; CONDITION is .55 to 1.15. Physical proof for these factors is needed.
ACTIVE_PROGRESS = min(remainingNormative, floor(availableStaffedMinutes*STAGE_SPEED)).
ACTUAL_USED = ceil(ACTIVE_PROGRESS/STAGE_SPEED), capped by staffed availability.
PASSIVE_PROGRESS = min(remainingNatural, realElapsedNaturalMinutes), skill/tool multiplier never applies.
Example: level 3, specialization 5-star, characteristic 5, no support = speed 1.378 (137.8%). No quality guarantee implied.

## Quality and mistakes
Execution-quality potential (not an item award):
QI=clamp(58 + .8*(skillScore-difficulty) + 1.6*familiarityCount + 15*(toolFactor-1) + 10*(conditionFactor-1),0,100).
Quality modifier points = round(QI-50). Indicative execution quality: below 30 -> 1 star, 30–49 -> 2, 50–69 -> 3, 70–89 -> 4, 90+ -> 5.
Uncertainty risk LOW/MODERATE/HIGH from skill margin and condition. No fake deterministic failure roll. Independent material, design, physical safety, testing and quality evidence gates remain mandatory. Good craftsmanship does NOT turn weak materials into impossibly strong ones.

## Live integration and safety
* Existing aggregate craft_advance orders retain their accepted normative minutes, receipts, queue, materials and writer; task-tagged Shura work uses the new speed in source-attested capability calculations.
* Existing capability_check can preview a stage with optional craftV4 configuration; optional craftV4 on craft_advance requires recipe/stage normative and progress to match the original order, or it rejects. All projections remain READ_ONLY_PROPOSALS.
* Passive stage and completion of non-inspection stage never mint goods; independent quality checking is still mandatory at the final inspection stage, plus existing semantic writer and single-custodian material ownership.
* Only live TEMP_RUNTIME competence/specialization/attribute data feed Shura's rated results. NPC jobs cannot borrow Shura's rating. Heren's skill and queue must be verified separately, not invented.
* New classifications wood_carving and cordage do NOT grant new specializations or canon entries. Future unlockable definitions require separate verified canonical registration and actual practiced learning.
* Claimed familiarity receipt IDs, tools, environment and natural wait input have sourceAttested=false; GM must check physical evidence before commit.
* Releasing does NOT change old four-day NPC orders automatically.
* Deno check + full tests + KV CI pass before one squash merge to main; keep existing Site, plugin identity, server Bearer auth and current save unchanged.

Engine release: 2.14.0-crafting-v4-2026-10-13.
