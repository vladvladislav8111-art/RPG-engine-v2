# Universal Work V1 — stage-based task design (2026-10-13)

## Purpose
Apply staged work planning to cargo receiving, document review, trade administration, research, household work and other time-dependent actions. Crafting V4 stays independent for physical production and does not replace this domain. This is a READ_ONLY proposal interface; no work, time, money, XP or products are committed by the planner.

## Stage model
Every task has typed stages with dependencies and an assigned actor. Each stage has a baseline workload split into fixed and variable minutes, a physical minimum, and optional skill domain. Passive intervals remain natural elapsed time and count as zero active hours for Shura.

An NPC's labor is never Shura's labor. A 120-minute job may contain 30 minutes of NPC unloading, 60 minutes of checking and 30 minutes of NPC putaway. If Shura takes responsibility for only 12 minutes of validated checking, the actor-time entry is 12, even if the complete process continues longer.

## Two independent ways to reduce time
1. Proficiency efficiency: source-verified expertise speeds up the same manual work, with physical floors.
2. Method substitution or selective processing: a materially different method may eliminate or replace part of the conventional workload. Source references are necessary but NOT independently verified by their shape or presence. Replacing the calculation with a verified supported method is not the same as simply multiplying the same calculation a second time.

For each stage record actor, baseline, physical minimum, method and its evidence, dependency and any required physical cross-check. Never automatically accept a claim that a HUD or a formula can detect inconsistencies; validate actual unlocked System functionality, data access, limitations and cargo irregularities. Mandatory full-coverage rules cannot be skipped merely because the worker is clever.

## Sample cargo receiving plan (calibration only)
Stage 1 unload: 30 min by porters.
Stage 2 document reading: 30 conventional min, conditionally 8 by Shura using a proven alternative method.
Stage 3 reconciliation: 20 conventional min, conditionally 4 by Shura using a proven alternative method.
Stage 4 suspect physical recheck: 10 min by porters.
Stage 5 putaway: 30 min by porters.
Baseline sequential total 120 min; proposed ideal minimum 82 min; conditional Shura active time 12 min; porters active time 70 min. In the real world, waiting for staff or documents can increase completion time. These example methods and sources are placeholders for verification, not evidence of actual current abilities, an offer, a signed receipt or game events.

## Clock, quality and protection
The computed makespan is a dependency-and-actor lower bound, not an ETA. Staff schedules, NPC consent, physical throughput, inspection obligations, paperwork, actual cargo and player choices all require separate evidence. Method shortening is provisional. No time advancement and no automatic salary, custody transfer, advancement, XP, SUP or player contract.

Source-integrated general work calculation is offered as a new V3 task_plan operation, plus an optional taskPlanV1 submode on existing workshop_capacity for compatibility with the existing published Bridge schema. The latter preserves workshop_capacity's original behavior when no taskPlanV1 is provided.

This document is a proposal pending Deno CI checks and safe merge to main. Do not change Shura's current save or accepted NPC contracts by applying these sample timings retroactively.
