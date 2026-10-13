# Effective characteristics V2.1 — live-source integration (2026-10-13)

## Input versus deployed rules
Adapted from the user-supplied \`3.txt\` prototype (10 stats, skill/specialization/milestone resolution, effect collection, skill checks, costs and auto-notice). The sample \`ShuraBuild\` is NOT a save, class, feat or source of truth. The actual live character comes from \`TEMP_RUNTIME\`. No new/parallel account of HP, XP, mana, SUP or skill levels is allowed.

The existing seven canonical roots are:
- \`competence.combat.melee\` (Combat)
- \`competence.crafting.practical_creation\` (Crafting & Creation)
- \`competence.magic.perception\` (Magic)
- \`competence.knowledge.research\` (Knowledge)
- \`competence.society.communication\` (Society)
- \`competence.survival.general\` (Survival)
- \`competence.body.physical_conditioning\` (Body)
Emergent Art and Engineering are separate source-verified disciplines, not four synthetic skills per pillar.

## What is implemented
- \`buildEffectiveCharacteristicFrame\` reads all 10 real \`CHARACTERISTICS\` values, committed competence levels, stars by exact \`Competence ID::Specialization\`, and only ACTIVE milestone rows. It is a SOURCE-ONLY, READ-ONLY projection.
- An ordinary substantive \`get_turn_context\` loads these existing rows in its existing batched Google read and returns the new \`effectiveCharacteristics\` overview. A MICRO/status-only turn stays cheap.
- \`evaluateCapability\` reuses current canonical task proficiency model (no competing d20 formula), with a SMALL secondary characteristic contribution. The secondary and primary cannot coincide. Relevant practical checks include force, balance, hand coordination, terrain signs, mental focus and social interpretation. Results remain V3 read-only proposals and require verified materials, difficulty and conditions.
- Known passive milestone IDs are automatically selected for GM review by topic; both original Trigger and Limits are included, and actual sensory evidence still controls what Shura perceives. Unknown/draft/locked milestones grant nothing. No new option/class/milestone is selected.
- The already ACTIVE \`Порядок мастера\` applies its exact source-stated **conditional** time reduction \`clamp(10 + 3*floor(max(0,CraftLevel-3)/2) + floor(max(0,Intelligence-8)/2) + floor(max(0,Coordination-7)/2) - floor(max(0,8-Intelligence)/2) - floor(max(0,7-Coordination)/2),0,25)\` percent. It only applies after independent evidence of a familiar repeat/setup operation, never to drying, curing, travel or QC.
- The resource preview includes \`HP = 20+3*Strength+2*Endurance+2*(Level-1)\` as a CANDIDATE, not yet canonical. Existing live engine Stamina \`26+4*Endurance+2*(Level-1)\` and Mana \`10*Intelligence\` remain untouched. Will is psychological effort under strain, NOT bonus Stamina. No arbitrary \`Wisdom\` mana added.
- No new physical or social result is automatically declared, only better sourced values and bounded GM hints. Future steps need explicit rule adoption/migration and safe writer tests before changing the existing max HP.

## Active milestone effect triggers
The five preexisting source-observed passive archetypes plus \`Порядок мастера\` use their exact LIVE rows: \`milestone.survival.eye_pioneer\`, \`milestone.crafting.design_thinking\`, \`milestone.magic.presence_sense\`, \`milestone.combat.repeatable_shot_cycle\`, \`milestone.research.distinguishability_threshold\`, \`milestone.crafting.master_order.lv3\`. Never retroactively add sample \`Глаз охотника\`, \`Железная воля\`, or \`Неутомимость\` from the prototype.

## Safety / game boundary
- Game time stays zero for meta context and CI, and no \`commit_turn\` is performed.
- Live save, current CHARACTERISTICS and RESOURCE maxima unchanged.
- World NPCs receive the same causal/physical rules only if the actor has a verified rating source; Shura's live ratings are NEVER used for NPC tasks.
- Existing Bearer authentication, Bridge tools, Site URL and Deno project identity stay unchanged.
- Any draft/release should pass \`deno check main.ts\`, the full Deno test suite and KV-fencing checks; release only after user authorization if not requested.
